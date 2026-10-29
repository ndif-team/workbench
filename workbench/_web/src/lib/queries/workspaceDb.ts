import { and, asc, desc, eq, inArray, isNull, sql, type AnyColumn } from "drizzle-orm";
import type { SerializedEditorState } from "lexical";

import { db } from "@/db/client";
import { chartConfigLinks, charts, configs, documents, lensRuns, workspaces } from "@/db/schema";
import type { Workspace } from "@/db/schema";
import type { ProlificParams } from "@/lib/prolific";
import { isUniqueViolation } from "@/lib/queries/workshopDb";
import { deriveReportTitle } from "@/lib/reportTitle";
import { LEGACY_TOOL_ALIASES, normalizeToolType, toolTypes, type ToolType } from "@/types/charts";
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

export const getWorkspaceById = async (workspaceId: string): Promise<Workspace | null> => {
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
 * 1 to 256 characters.
 */
export const createWorkspace = async (
    userId: string,
    name: string,
    workshopId?: string,
    prolific?: ProlificParams | null,
): Promise<Workspace> => {
    const [workspace] = await db
        .insert(workspaces)
        .values({
            userId,
            name: validWorkspaceName(name),
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

/** The user's workspaces (folders) with item counts. Excludes the default workspace. */
export const getWorkspaces = async (userId: string) => {
    const workspaceList = await db
        .select({
            id: workspaces.id,
            userId: workspaces.userId,
            name: workspaces.name,
            public: workspaces.public,
            updatedAt: workspaces.updatedAt,
            chartCount: sql<number>`cast(count(distinct ${charts.id}) as integer)`,
            documentCount: sql<number>`cast(count(distinct ${documents.id}) as integer)`,
        })
        .from(workspaces)
        .leftJoin(charts, eq(workspaces.id, charts.workspaceId))
        .leftJoin(documents, eq(workspaces.id, documents.workspaceId))
        .where(and(eq(workspaces.userId, userId), eq(workspaces.isDefault, false)))
        .groupBy(workspaces.id)
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
 * workspace. The name is trimmed and must be 1 to 256 characters.
 */
export const renameWorkspace = async (
    userId: string,
    workspaceId: string,
    name: string,
): Promise<Workspace> => {
    const [renamed] = await db
        .update(workspaces)
        .set({ name: validWorkspaceName(name) })
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

/** Position just past the last chart or report in a workspace. */
export const getNextWorkspaceItemPosition = async (workspaceId: string): Promise<number> => {
    const [chartRows, docRows] = await Promise.all([
        db
            .select({ max: sql<number | null>`max(${charts.position})` })
            .from(charts)
            .where(eq(charts.workspaceId, workspaceId)),
        db
            .select({ max: sql<number | null>`max(${documents.position})` })
            .from(documents)
            .where(eq(documents.workspaceId, workspaceId)),
    ]);
    const maxPos = Math.max(Number(chartRows[0]?.max ?? -1), Number(docRows[0]?.max ?? -1));
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
 * unfiled charts stay unfiled.
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
        .orderBy(asc(workspaces.createdAt))
        .limit(1);

    try {
        if (legacy) {
            await db
                .update(workspaces)
                .set({ isDefault: true, updatedAt: sql`${workspaces.updatedAt}` })
                .where(eq(workspaces.id, legacy.id));
        } else {
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

type LibraryReportRow = {
    id: string;
    workspaceId: string;
    content: unknown;
    position: number;
    createdAt: Date;
    updatedAt: Date;
};

/** A top-level string field of a JSON column, as text (jsonb in Postgres, JSON text in SQLite). */
const jsonTextField = (column: typeof charts.data, key: string) =>
    process.env.NEXT_PUBLIC_LOCAL_DB === "true"
        ? sql<string | null>`json_extract(${column}, ${`$.${key}`})`
        : sql<string | null>`${column}->>${key}`;

const byPosition = (a: LibraryItem, b: LibraryItem) =>
    a.position - b.position || a.createdAt.getTime() - b.createdAt.getTime();

const byRecency = (a: LibraryItem, b: LibraryItem) => b.updatedAt.getTime() - a.updatedAt.getTime();

/**
 * Every workspace of the user with its charts and reports, for the global
 * sidebar. Creates the default workspace on first read. Batched per user: one
 * query each for workspaces, charts and reports, whatever the folder count.
 */
export const getWorkspaceLibrary = async (userId: string): Promise<WorkspaceLibrary> => {
    const defaultWorkspace = await getOrCreateDefaultWorkspace(userId);

    const [workspaceRows, chartRows, reportRows] = (await Promise.all([
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
                chartPrompt: jsonTextField(charts.data, "sourcePrompt"),
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
            items: (itemsByWorkspace.get(w.id) ?? []).sort(byPosition),
        }));

    return {
        defaultWorkspaceId: defaultWorkspace.id,
        defaultItems: (itemsByWorkspace.get(defaultWorkspace.id) ?? []).sort(byRecency),
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

const scopeColumns = {
    workspaceId: workspaces.id,
    name: workspaces.name,
    workshopId: workspaces.workshopId,
    isDefault: workspaces.isDefault,
};

const toScope = (row: {
    workspaceId: string;
    name: string;
    workshopId: string | null;
    isDefault: boolean;
}) => ({
    workspaceId: row.workspaceId,
    name: row.name,
    workshopId: row.workshopId ?? null,
    isDefault: !!row.isDefault,
});

/** The workspace a chart page renders in, or null when the chart doesn't exist. */
export const getChartWorkspaceScope = async (chartId: string): Promise<WorkspaceScope | null> => {
    const [row] = await db
        .select(scopeColumns)
        .from(charts)
        .innerJoin(workspaces, eq(charts.workspaceId, workspaces.id))
        .where(eq(charts.id, chartId))
        .limit(1);
    return row ? toScope(row) : null;
};

/** The workspace a report page renders in, or null when the report doesn't exist. */
export const getReportWorkspaceScope = async (
    documentId: string,
): Promise<WorkspaceScope | null> => {
    const [row] = await db
        .select(scopeColumns)
        .from(documents)
        .innerJoin(workspaces, eq(documents.workspaceId, workspaces.id))
        .where(eq(documents.id, documentId))
        .limit(1);
    return row ? toScope(row) : null;
};

/**
 * The user's most recently updated chart of a live tool, outside workshop
 * workspaces, with that tool. A chart's tool is its config's type, or the
 * chart's own type when it has no config.
 */
export const getMostRecentUserChart = async (
    userId: string,
): Promise<{ chartId: string; toolType: ToolType } | null> => {
    const toolType = sql<string>`coalesce(${configs.type}, ${charts.type})`;
    const [row] = await db
        .select({ chartId: charts.id, toolType })
        .from(charts)
        .innerJoin(workspaces, eq(charts.workspaceId, workspaces.id))
        .leftJoin(chartConfigLinks, eq(charts.id, chartConfigLinks.chartId))
        .leftJoin(configs, eq(chartConfigLinks.configId, configs.id))
        .where(
            and(
                eq(workspaces.userId, userId),
                isNull(workspaces.workshopId),
                inArray(toolType, [...toolTypes, ...Object.keys(LEGACY_TOOL_ALIASES)]),
            ),
        )
        .orderBy(desc(charts.updatedAt))
        .limit(1);

    return row
        ? { chartId: row.chartId, toolType: normalizeToolType(row.toolType) as ToolType }
        : null;
};
