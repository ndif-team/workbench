import {
    and,
    asc,
    desc,
    eq,
    inArray,
    isNull,
    ne,
    sql,
    type AnyColumn,
    type SQLWrapper,
} from "drizzle-orm";
import type { SerializedEditorState } from "lexical";

import { db } from "@/db/client";
import {
    chartConfigLinks,
    charts,
    chats,
    configs,
    documents,
    isUuid,
    jsonTextField,
    lensRuns,
    workshops,
    workspaces,
} from "@/db/schema";
import type { Workspace } from "@/db/schema";
import type { ProlificParams } from "@/lib/prolific";
import { isUniqueViolation } from "@/lib/queries/workshopDb";
import { deriveReportTitle } from "@/lib/reportTitle";
import { normalizeToolType } from "@/types/charts";
import type {
    LibraryItem,
    LibraryWorkspace,
    WorkspaceItemKind,
    WorkspaceLibrary,
    WorkspaceScope,
} from "@/types/workspaces";

/**
 * Unguarded workspace DB internals. The "use server" RPC surface lives in
 * workspaceQueries.ts, which resolves the signed-in user before calling these;
 * keeping them here makes them directly testable under bun:test (no Supabase
 * session to fake) and keeps them off the public RPC surface.
 */

/** Stored name of a default workspace. Never displayed. */
export const DEFAULT_WORKSPACE_NAME = "Default workspace";

/** The name the old first-visit flow gave the workspace it auto-created. */
const LEGACY_DEFAULT_WORKSPACE_NAME = "Default Workspace";

/** Longest workspace name, in characters: the Postgres column is varchar(256). */
export const MAX_WORKSPACE_NAME_LENGTH = 256;

/** `name` trimmed; throws when that leaves it empty or longer than the column allows. */
const validWorkspaceName = (name: string): string => {
    const trimmed = name.trim();
    const length = [...trimmed].length;
    if (length === 0 || length > MAX_WORKSPACE_NAME_LENGTH) {
        throw new Error(
            `A workspace name must be between 1 and ${MAX_WORKSPACE_NAME_LENGTH} characters`,
        );
    }
    return trimmed;
};

/**
 * Throws when another of the user's workspaces already has `name`, ignoring
 * case: folder names must tell folders apart. The default workspace (never
 * shown) doesn't count; `exceptId` is the workspace being renamed.
 */
const assertWorkspaceNameFree = async (userId: string, name: string, exceptId?: string) => {
    const [taken] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(
            and(
                eq(workspaces.userId, userId),
                eq(workspaces.isDefault, false),
                sql`lower(${workspaces.name}) = lower(${name})`,
                exceptId ? ne(workspaces.id, exceptId) : undefined,
            ),
        )
        .limit(1);
    if (taken) throw new Error("A workspace with that name already exists");
};

/** A workspace by id; null when there is none (or the id isn't a UUID, as from a mistyped URL). */
export const getWorkspaceById = async (workspaceId: string): Promise<Workspace | null> => {
    if (!isUuid(workspaceId)) return null;
    const [workspace] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId))
        .limit(1);
    return (workspace ?? null) as Workspace | null;
};

/**
 * Creates a workspace for a user: a folder, or, with `workshopId`, a workshop
 * participant's workspace (the join action). The name is trimmed and must be
 * 1 to 256 characters; a folder's must also differ from the user's other
 * workspaces' (ignoring case).
 */
export const createWorkspace = async (
    userId: string,
    name: string,
    workshopId?: string,
    prolific?: ProlificParams | null,
): Promise<Workspace> => {
    const validName = validWorkspaceName(name);
    if (!workshopId) await assertWorkspaceNameFree(userId, validName);
    const [workspace] = await db
        .insert(workspaces)
        .values({
            userId,
            name: validName,
            workshopId: workshopId ?? null,
            prolific: prolific ?? null,
        })
        .returning();
    return workspace as Workspace;
};

/**
 * Backfills Prolific identifiers onto an existing workspace, but only if none
 * were captured before: first-touch wins, so a re-join carrying a fresh
 * Prolific session doesn't clobber the original attribution.
 */
export const setWorkspaceProlificIfEmpty = async (
    workspaceId: string,
    prolific: ProlificParams,
) => {
    await db
        .update(workspaces)
        .set({ prolific })
        .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.prolific)));
};

/**
 * The user's workspaces (folders) with item counts. Excludes the default
 * workspace. Each count is its own subquery, so a folder's rows don't
 * multiply across the item tables as joins would.
 */
export const getWorkspaces = async (userId: string) => {
    const countIn = (table: typeof charts | typeof chats | typeof documents) =>
        sql<number>`(select cast(count(*) as integer) from ${table} where ${table}."workspace_id" = ${workspaces}."id")`;
    const workspaceList = await db
        .select({
            id: workspaces.id,
            userId: workspaces.userId,
            name: workspaces.name,
            public: workspaces.public,
            updatedAt: workspaces.updatedAt,
            chartCount: countIn(charts),
            documentCount: countIn(documents),
            chatCount: countIn(chats),
        })
        .from(workspaces)
        .where(and(eq(workspaces.userId, userId), eq(workspaces.isDefault, false)))
        .orderBy(desc(workspaces.updatedAt));

    return workspaceList;
};

/**
 * The user's own folders: neither their default workspace nor a workshop
 * workspace, whose name the workshop sets and whose contents are study data.
 */
const isUserFolder = (userId: string, workspaceId: string) =>
    and(
        eq(workspaces.id, workspaceId),
        eq(workspaces.userId, userId),
        eq(workspaces.isDefault, false),
        isNull(workspaces.workshopId),
    );

/**
 * Renames one of the user's folders; never their default or a workshop
 * workspace. The name is trimmed, must be 1 to 256 characters, and must
 * differ from the user's other workspaces' (ignoring case).
 */
export const renameWorkspace = async (
    userId: string,
    workspaceId: string,
    name: string,
): Promise<Workspace> => {
    const validName = validWorkspaceName(name);
    await assertWorkspaceNameFree(userId, validName, workspaceId);
    const [renamed] = await db
        .update(workspaces)
        .set({ name: validName })
        .where(isUserFolder(userId, workspaceId))
        .returning();
    if (!renamed) throw new Error("Workspace not found or access denied");
    return renamed as Workspace;
};

/**
 * Deletes one of the user's folders and, by cascade, its contents; never
 * their default or a workshop workspace. Anything else is left alone.
 */
export const deleteWorkspace = async (userId: string, workspaceId: string): Promise<void> => {
    await db.delete(workspaces).where(isUserFolder(userId, workspaceId));
};

/**
 * Saves the order of one of the user's workspaces: each item's position is
 * its index. One `UPDATE … SET position = CASE id … END` per table, so each
 * table's order lands atomically on both dialects with no transaction (which
 * drizzle's sqlite drivers can't run async). Ids outside the workspace are
 * left alone.
 */
export const reorderWorkspaceItems = async (
    userId: string,
    workspaceId: string,
    items: { kind: WorkspaceItemKind; id: string }[],
): Promise<void> => {
    const workspace = await getWorkspaceById(workspaceId);
    if (!workspace || workspace.userId !== userId) {
        throw new Error("Workspace not found or access denied");
    }
    const ranked = items.map((item, position) => ({ ...item, position }));
    const orderOf = (kind: WorkspaceItemKind, column: AnyColumn) => {
        const rows = ranked.filter((item) => item.kind === kind);
        const cases = rows.map(
            ({ id, position }) => sql`when ${id} then ${sql.raw(`${position}`)}`,
        );
        return {
            ids: rows.map((r) => r.id),
            position: sql`case ${column} ${sql.join(cases, sql` `)} end`,
        };
    };

    const chartOrder = orderOf("chart", charts.id);
    if (chartOrder.ids.length > 0) {
        await db
            .update(charts)
            .set({ position: chartOrder.position, updatedAt: sql`${charts.updatedAt}` })
            .where(and(inArray(charts.id, chartOrder.ids), eq(charts.workspaceId, workspaceId)));
    }
    const chatOrder = orderOf("chat", chats.id);
    if (chatOrder.ids.length > 0) {
        await db
            .update(chats)
            .set({ position: chatOrder.position, updatedAt: sql`${chats.updatedAt}` })
            .where(and(inArray(chats.id, chatOrder.ids), eq(chats.workspaceId, workspaceId)));
    }
    const reportOrder = orderOf("report", documents.id);
    if (reportOrder.ids.length > 0) {
        await db
            .update(documents)
            .set({ position: reportOrder.position, updatedAt: sql`${documents.updatedAt}` })
            .where(
                and(inArray(documents.id, reportOrder.ids), eq(documents.workspaceId, workspaceId)),
            );
    }
};

export const touchWorkspace = async (workspaceId: string) => {
    await db
        .update(workspaces)
        .set({ updatedAt: new Date() })
        .where(eq(workspaces.id, workspaceId));
};

/** Position just past the last chart, chat or report in a workspace. */
export const getNextWorkspaceItemPosition = async (workspaceId: string): Promise<number> => {
    const maxIn = (table: typeof charts | typeof chats | typeof documents) =>
        db
            .select({ max: sql<number | null>`max(${table.position})` })
            .from(table)
            .where(eq(table.workspaceId, workspaceId));
    const rows = await Promise.all([maxIn(charts), maxIn(chats), maxIn(documents)]);
    const maxPos = Math.max(...rows.map(([row]) => Number(row?.max ?? -1)));
    return maxPos + 1;
};

const getDefaultWorkspace = async (userId: string): Promise<Workspace | null> => {
    const [workspace] = await db
        .select()
        .from(workspaces)
        .where(and(eq(workspaces.userId, userId), eq(workspaces.isDefault, true)))
        .limit(1);
    return (workspace ?? null) as Workspace | null;
};

/**
 * The user's default workspace, created on first use. A user who already has
 * a non-workshop workspace named "Default Workspace" (what the old first-visit
 * flow created) gets their oldest such workspace adopted instead, so earlier
 * unfiled charts stay unfiled; any others of that name stay folders. When the
 * one picked vanishes before it is adopted, a new default is inserted.
 *
 * Check-then-act, made safe by the one-default-per-user unique index: a racing
 * insert or adoption loses the conflict, and the final re-select returns
 * whichever default won.
 */
export const getOrCreateDefaultWorkspace = async (userId: string): Promise<Workspace> => {
    const existing = await getDefaultWorkspace(userId);
    if (existing) return existing;

    const [legacy] = await db
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(
            and(
                eq(workspaces.userId, userId),
                eq(workspaces.name, LEGACY_DEFAULT_WORKSPACE_NAME),
                isNull(workspaces.workshopId),
            ),
        )
        .orderBy(asc(workspaces.createdAt), asc(workspaces.id))
        .limit(1);

    try {
        const adopted = legacy
            ? await db
                  .update(workspaces)
                  .set({ isDefault: true, updatedAt: sql`${workspaces.updatedAt}` })
                  .where(eq(workspaces.id, legacy.id))
                  .returning({ id: workspaces.id })
            : [];
        if (adopted.length === 0) {
            await db
                .insert(workspaces)
                .values({ userId, name: DEFAULT_WORKSPACE_NAME, isDefault: true })
                .onConflictDoNothing();
        }
    } catch (err) {
        if (!isUniqueViolation(err)) throw err;
    }

    const created = await getDefaultWorkspace(userId);
    if (!created) throw new Error("Could not create the default workspace");
    return created;
};

type LibraryChartRow = {
    id: string;
    workspaceId: string;
    name: string | null;
    chartType: string | null;
    configType: string | null;
    configData: { model?: string; prompt?: string; srcPrompt?: string } | null;
    /** Patch Lens keeps its prompts on the chart row, not the config. */
    chartPrompt: string | null;
    hasData: boolean | number;
    position: number;
    createdAt: Date;
    updatedAt: Date;
};

type LibraryChatRow = {
    id: string;
    workspaceId: string;
    name: string;
    model: string;
    position: number;
    createdAt: Date;
    updatedAt: Date;
};

type LibraryReportRow = {
    id: string;
    workspaceId: string;
    content: unknown;
    position: number;
    createdAt: Date;
    updatedAt: Date;
};

/**
 * Every workspace of the user with its charts, chats and reports, for the global
 * sidebar. Only a Patch Lens chart's `data` is read into (for its source
 * prompt); other tools' results can be large and only their presence is
 * selected. Creates the default workspace on first read unless `createDefault`
 * is false (a workshop participant never gets one). Batched per user: one
 * query each for workspaces, charts, chats and reports, whatever the folder
 * count.
 */
export const getWorkspaceLibrary = async (
    userId: string,
    { createDefault = true }: { createDefault?: boolean } = {},
): Promise<WorkspaceLibrary> => {
    const defaultWorkspace = createDefault
        ? await getOrCreateDefaultWorkspace(userId)
        : await getDefaultWorkspace(userId);

    const isPatchLens = sql`${configs.type} = 'patch-lens' or ${charts.type} = 'patch-lens'`;
    const sourcePrompt = jsonTextField(charts.data, "sourcePrompt");
    const patchLensPrompt = sql<string | null>`case when ${isPatchLens} then ${sourcePrompt} end`;

    const [workspaceRows, chartRows, chatRows, reportRows] = (await Promise.all([
        db
            .select({
                id: workspaces.id,
                name: workspaces.name,
                isDefault: workspaces.isDefault,
                workshopId: workspaces.workshopId,
                createdAt: workspaces.createdAt,
                updatedAt: workspaces.updatedAt,
            })
            .from(workspaces)
            .where(eq(workspaces.userId, userId))
            .orderBy(desc(workspaces.updatedAt)),
        db
            .select({
                id: charts.id,
                workspaceId: charts.workspaceId,
                name: charts.name,
                chartType: charts.type,
                configType: configs.type,
                configData: configs.data,
                chartPrompt: patchLensPrompt,
                hasData: sql<boolean>`${charts.data} is not null`,
                position: charts.position,
                createdAt: charts.createdAt,
                updatedAt: charts.updatedAt,
            })
            .from(charts)
            .innerJoin(workspaces, eq(charts.workspaceId, workspaces.id))
            .leftJoin(chartConfigLinks, eq(charts.id, chartConfigLinks.chartId))
            .leftJoin(configs, eq(chartConfigLinks.configId, configs.id))
            .where(eq(workspaces.userId, userId)),
        db
            .select({
                id: chats.id,
                workspaceId: chats.workspaceId,
                name: chats.name,
                model: chats.model,
                position: chats.position,
                createdAt: chats.createdAt,
                updatedAt: chats.updatedAt,
            })
            .from(chats)
            .innerJoin(workspaces, eq(chats.workspaceId, workspaces.id))
            .where(eq(workspaces.userId, userId)),
        db
            .select({
                id: documents.id,
                workspaceId: documents.workspaceId,
                content: documents.content,
                position: documents.position,
                createdAt: documents.createdAt,
                updatedAt: documents.updatedAt,
            })
            .from(documents)
            .innerJoin(workspaces, eq(documents.workspaceId, workspaces.id))
            .where(eq(workspaces.userId, userId)),
    ])) as [
        Array<{
            id: string;
            name: string;
            isDefault: boolean;
            workshopId: string | null;
            createdAt: Date;
            updatedAt: Date;
        }>,
        LibraryChartRow[],
        LibraryChatRow[],
        LibraryReportRow[],
    ];

    const itemsByWorkspace = new Map<string, LibraryItem[]>();
    const add = (item: LibraryItem) => {
        const list = itemsByWorkspace.get(item.workspaceId);
        if (list) list.push(item);
        else itemsByWorkspace.set(item.workspaceId, [item]);
    };
    for (const c of chartRows) {
        add({
            kind: "chart",
            id: c.id,
            workspaceId: c.workspaceId,
            name: c.name ?? "",
            toolType: normalizeToolType(c.configType ?? c.chartType),
            model: c.configData?.model || null,
            prompt:
                (c.configData?.prompt || c.configData?.srcPrompt || c.chartPrompt)?.trim() || null,
            hasData: !!c.hasData,
            position: c.position,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt,
        });
    }
    for (const c of chatRows) add({ kind: "chat", ...c });
    for (const r of reportRows) {
        add({
            kind: "report",
            id: r.id,
            workspaceId: r.workspaceId,
            title: deriveReportTitle(r.content as SerializedEditorState),
            position: r.position,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
        });
    }

    const folders: LibraryWorkspace[] = workspaceRows
        .filter((w) => !w.isDefault)
        .map((w) => ({
            id: w.id,
            name: w.name,
            isWorkshop: w.workshopId != null,
            createdAt: w.createdAt,
            updatedAt: w.updatedAt,
            items: (itemsByWorkspace.get(w.id) ?? []).sort(
                (a, b) => a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime(),
            ),
        }));

    return {
        defaultWorkspaceId: defaultWorkspace?.id ?? null,
        defaultItems: defaultWorkspace
            ? (itemsByWorkspace.get(defaultWorkspace.id) ?? []).sort(
                  (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
              )
            : [],
        workspaces: folders,
    };
};

/**
 * Checks that the user may move an item out of `sourceWorkspaceId` and into
 * the target (null: their default workspace), and resolves the target's id.
 * Both must belong to the user and neither may be a workshop workspace.
 */
const resolveMoveTarget = async (
    userId: string,
    sourceWorkspaceId: string,
    targetWorkspaceId: string | null,
): Promise<string> => {
    const assertMovable = async (workspaceId: string) => {
        const [workspace] = await db
            .select({ userId: workspaces.userId, workshopId: workspaces.workshopId })
            .from(workspaces)
            .where(eq(workspaces.id, workspaceId))
            .limit(1);
        if (!workspace || workspace.userId !== userId) {
            throw new Error("Workspace not found or access denied");
        }
        if (workspace.workshopId) {
            throw new Error("Items can't be moved into or out of a workshop workspace");
        }
    };

    await assertMovable(sourceWorkspaceId);
    const targetId = targetWorkspaceId ?? (await getOrCreateDefaultWorkspace(userId)).id;
    if (targetId !== sourceWorkspaceId) await assertMovable(targetId);
    return targetId;
};

/**
 * Moves a chart to the end of another of the user's workspaces (null: the
 * default workspace). Its config and lens runs carry their own workspace_id
 * and cascade on workspace delete, so they move with it.
 *
 * Sequential rather than a transaction (drizzle's sqlite drivers reject async
 * transaction callbacks). The chart row is written last, so a partial failure
 * leaves the chart in its source workspace and a retry converges.
 */
export const moveChart = async (
    userId: string,
    chartId: string,
    targetWorkspaceId: string | null,
): Promise<void> => {
    const [chart] = await db
        .select({ workspaceId: charts.workspaceId })
        .from(charts)
        .where(eq(charts.id, chartId))
        .limit(1);
    if (!chart) throw new Error("Chart not found");

    const sourceId: string = chart.workspaceId;
    const targetId = await resolveMoveTarget(userId, sourceId, targetWorkspaceId);
    if (targetId === sourceId) return;

    const position = await getNextWorkspaceItemPosition(targetId);
    await db.update(lensRuns).set({ workspaceId: targetId }).where(eq(lensRuns.chartId, chartId));
    await db
        .update(configs)
        .set({ workspaceId: targetId })
        .where(
            inArray(
                configs.id,
                db
                    .select({ id: chartConfigLinks.configId })
                    .from(chartConfigLinks)
                    .where(eq(chartConfigLinks.chartId, chartId)),
            ),
        );
    await db
        .update(charts)
        .set({ workspaceId: targetId, position, updatedAt: sql`${charts.updatedAt}` })
        .where(eq(charts.id, chartId));
    await Promise.all([touchWorkspace(sourceId), touchWorkspace(targetId)]);
};

/** Moves a report to the end of another of the user's workspaces (null: the default workspace). */
export const moveReport = async (
    userId: string,
    documentId: string,
    targetWorkspaceId: string | null,
): Promise<void> => {
    const [report] = await db
        .select({ workspaceId: documents.workspaceId })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);
    if (!report) throw new Error("Report not found");

    const sourceId: string = report.workspaceId;
    const targetId = await resolveMoveTarget(userId, sourceId, targetWorkspaceId);
    if (targetId === sourceId) return;

    const position = await getNextWorkspaceItemPosition(targetId);
    await db
        .update(documents)
        .set({ workspaceId: targetId, position, updatedAt: sql`${documents.updatedAt}` })
        .where(eq(documents.id, documentId));
    await Promise.all([touchWorkspace(sourceId), touchWorkspace(targetId)]);
};

/** Moves a chat (its messages follow it) to the end of another of the user's workspaces (null: the default workspace). */
export const moveChat = async (
    userId: string,
    chatId: string,
    targetWorkspaceId: string | null,
): Promise<void> => {
    const [chat] = await db
        .select({ workspaceId: chats.workspaceId })
        .from(chats)
        .where(eq(chats.id, chatId))
        .limit(1);
    if (!chat) throw new Error("Chat not found");

    const sourceId: string = chat.workspaceId;
    const targetId = await resolveMoveTarget(userId, sourceId, targetWorkspaceId);
    if (targetId === sourceId) return;

    const position = await getNextWorkspaceItemPosition(targetId);
    await db
        .update(chats)
        .set({ workspaceId: targetId, position, updatedAt: sql`${chats.updatedAt}` })
        .where(eq(chats.id, chatId));
    await Promise.all([touchWorkspace(sourceId), touchWorkspace(targetId)]);
};

/** The scope of the workspace whose id `workspaceId` selects (an item's workspace_id), or null. */
const getWorkspaceScope = async (workspaceId: SQLWrapper): Promise<WorkspaceScope | null> => {
    const [workspace] = await db
        .select({
            id: workspaces.id,
            name: workspaces.name,
            workshopId: workspaces.workshopId,
            tutorialId: workshops.tutorialId,
            isDefault: workspaces.isDefault,
        })
        .from(workspaces)
        .leftJoin(workshops, eq(workshops.id, workspaces.workshopId))
        .where(inArray(workspaces.id, workspaceId))
        .limit(1);
    if (!workspace) return null;
    return {
        workspaceId: workspace.id,
        name: workspace.name,
        workshopId: workspace.workshopId ?? null,
        tutorialId: workspace.tutorialId ?? null,
        isDefault: !!workspace.isDefault,
    };
};

/** The workspace a chart page renders in, or null when the chart doesn't exist (or the id isn't a UUID). */
export const getChartWorkspaceScope = async (chartId: string): Promise<WorkspaceScope | null> =>
    isUuid(chartId)
        ? getWorkspaceScope(
              db.select({ id: charts.workspaceId }).from(charts).where(eq(charts.id, chartId)),
          )
        : null;

/** The workspace a report page renders in, or null when the report doesn't exist (or the id isn't a UUID). */
export const getReportWorkspaceScope = async (
    documentId: string,
): Promise<WorkspaceScope | null> =>
    isUuid(documentId)
        ? getWorkspaceScope(
              db
                  .select({ id: documents.workspaceId })
                  .from(documents)
                  .where(eq(documents.id, documentId)),
          )
        : null;

/** The workspace a chat page renders in, or null when the chat doesn't exist (or the id isn't a UUID). */
export const getChatWorkspaceScope = async (chatId: string): Promise<WorkspaceScope | null> =>
    isUuid(chatId)
        ? getWorkspaceScope(
              db.select({ id: chats.workspaceId }).from(chats).where(eq(chats.id, chatId)),
          )
        : null;
