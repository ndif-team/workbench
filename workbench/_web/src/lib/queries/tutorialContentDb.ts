import { db } from "@/db/client";
import { tutorials, workshops, workspaces } from "@/db/schema";
import type { Tutorial } from "@/db/schema";
import { eq } from "drizzle-orm";
import { desc } from "drizzle-orm";

import type { TutorialContent } from "@/types/tutorial-content";
import {
    PROLIFIC_TUTORIAL_SEED,
    PROLIFIC_TUTORIAL_NAME,
    PROLIFIC_TUTORIAL_SLUG,
} from "@/tutorials/prolificSeed";
import { isUniqueViolation } from "@/lib/queries/workshopDb";

/**
 * Unguarded tutorial-content DB internals. The "use server" RPC surface lives in
 * tutorialContentQueries.ts (admin CRUD wrapped in requireAdmin + an unguarded
 * participant read). Kept here so bun:test can exercise it without a Supabase
 * session, mirroring the workshopDb / workshopQueries split.
 */

export type TutorialInput = {
    name: string;
    data: TutorialContent;
    slug?: string;
    createdBy?: string;
};

const slugify = (name: string): string =>
    name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 56) || "tutorial";

const randomSuffix = (): string => Math.random().toString(36).slice(2, 8);

/**
 * Content shape guard for admin-authored JSON (which bypasses the TS types). The
 * participant panel and store dereference `prompts`, `hints`, and `progression`
 * on every unit with no runtime guard, so a structurally-incomplete unit would
 * crash the tutorial to the error boundary; unit ids are stored in
 * tutorial_events.stepId (varchar(64)), so an over-long id would make telemetry
 * silently drop that unit's events. Reject all of that at authoring time.
 */
export const validateTutorialContent = (content: TutorialContent): TutorialContent => {
    if (!content || !Array.isArray(content.units) || content.units.length === 0) {
        throw new Error("Tutorial must have at least one unit");
    }
    const ids = content.units.map((u) => u.id);
    if (new Set(ids).size !== ids.length) {
        throw new Error("Tutorial unit ids must be unique");
    }
    const validOn = new Set(["run", "patch", "manual"]);
    // Only the run-derived check kinds are wired up in the panel; layerBand has a
    // type slot but no scoring, so reject it rather than let it mis-score.
    const validCheckKinds = new Set(["topToken", "secondToken"]);
    for (const u of content.units) {
        if (!u.id || !u.title) throw new Error("Every unit needs an id and a title");
        if (u.id.length > 64) {
            throw new Error(`Unit id "${u.id}" exceeds 64 characters`);
        }
        if (!Array.isArray(u.prompts)) {
            throw new Error(`Unit "${u.id}" needs a prompts array`);
        }
        if (!Array.isArray(u.hints)) {
            throw new Error(`Unit "${u.id}" needs a hints array`);
        }
        for (const h of u.hints) {
            if (typeof h?.stage !== "number" || typeof h?.text !== "string") {
                throw new Error(`Unit "${u.id}" has a malformed hint rung`);
            }
        }
        if (!u.progression || !validOn.has(u.progression.on)) {
            throw new Error(`Unit "${u.id}" needs a progression.on of run, patch, or manual`);
        }
        // A malformed successPredicate silently mis-scores at runtime (an omitted
        // value makes topTokenNotEqual always-true; a typo'd kind never completes),
        // so validate it here the same way check.kind is validated below.
        const pred = u.progression.successPredicate;
        if (pred !== undefined) {
            if (pred.kind === "topTokenNotEqual") {
                if (typeof pred.value !== "string" || pred.value.length === 0) {
                    throw new Error(
                        `Unit "${u.id}" topTokenNotEqual predicate needs a non-empty value`,
                    );
                }
            } else if (pred.kind !== "always") {
                throw new Error(
                    `Unit "${u.id}" has an unsupported successPredicate kind "${(pred as { kind?: string }).kind}"`,
                );
            }
        }
        if (u.check && !validCheckKinds.has(u.check.kind)) {
            throw new Error(`Unit "${u.id}" has an unsupported check kind "${u.check.kind}"`);
        }
    }
    return content;
};

export const getTutorialById = async (id: string): Promise<Tutorial | null> => {
    const [row] = await db.select().from(tutorials).where(eq(tutorials.id, id)).limit(1);
    return (row ?? null) as Tutorial | null;
};

const getTutorialBySlug = async (slug: string): Promise<Tutorial | null> => {
    const [row] = await db.select().from(tutorials).where(eq(tutorials.slug, slug)).limit(1);
    return (row ?? null) as Tutorial | null;
};

export const listTutorials = async (): Promise<Tutorial[]> => {
    return (await db.select().from(tutorials).orderBy(desc(tutorials.updatedAt))) as Tutorial[];
};

export const createTutorial = async (input: TutorialInput): Promise<Tutorial> => {
    const data = validateTutorialContent(input.data);
    const baseSlug = input.slug ? slugify(input.slug) : slugify(input.name);
    for (let attempt = 0; ; attempt++) {
        try {
            const slug = attempt === 0 ? baseSlug : `${baseSlug}-${randomSuffix()}`;
            const [row] = await db
                .insert(tutorials)
                .values({ name: input.name, slug, data, createdBy: input.createdBy ?? "" })
                .returning();
            return row as Tutorial;
        } catch (err) {
            if (attempt >= 3 || !isUniqueViolation(err)) throw err;
        }
    }
};

export const updateTutorial = async (
    id: string,
    updates: { name?: string; data?: TutorialContent },
): Promise<Tutorial> => {
    const set: { name?: string; data?: TutorialContent } = {};
    if (updates.name !== undefined) set.name = updates.name;
    if (updates.data !== undefined) set.data = validateTutorialContent(updates.data);
    const [row] = await db.update(tutorials).set(set).where(eq(tutorials.id, id)).returning();
    if (!row) throw new Error("Tutorial not found");
    return row as Tutorial;
};

export const deleteTutorial = async (id: string): Promise<void> => {
    // pg carries an "on delete set null" FK on workshops.tutorialId; sqlite
    // mirrors are plain columns, so null the pointers explicitly (same behavior
    // on both backends — workshops fall back to the seed demo tutorial).
    await db.update(workshops).set({ tutorialId: null }).where(eq(workshops.tutorialId, id));
    await db.delete(tutorials).where(eq(tutorials.id, id));
};

/**
 * Idempotently ensure the demo seed tutorial exists, returning its row. Called
 * by the seed script and as a safety net so the participant read path always
 * resolves to a real tutorial. Concurrent callers converge via the unique slug.
 */
export const ensureSeedTutorial = async (): Promise<Tutorial> => {
    const existing = await getTutorialBySlug(PROLIFIC_TUTORIAL_SLUG);
    if (existing) return existing;
    try {
        const [row] = await db
            .insert(tutorials)
            .values({
                name: PROLIFIC_TUTORIAL_NAME,
                slug: PROLIFIC_TUTORIAL_SLUG,
                data: PROLIFIC_TUTORIAL_SEED,
                createdBy: "seed",
            })
            .returning();
        return row as Tutorial;
    } catch (err) {
        if (isUniqueViolation(err)) {
            const row = await getTutorialBySlug(PROLIFIC_TUTORIAL_SLUG);
            if (row) return row;
        }
        throw err;
    }
};

/**
 * Resolve the tutorial content a workspace should run: its workshop's assigned
 * tutorial, else the seeded demo. Falls back to the in-code seed constant if the
 * demo row has not been inserted yet, so the guided tutorial always works.
 */
export const resolveTutorialForWorkspace = async (
    workspaceId: string,
): Promise<TutorialContent> => {
    // Never leave a (workshop) participant with no tutorial: on any DB error fall
    // back to the in-code seed rather than throwing, since in workshop mode the
    // guided tutorial replaces the reactour walkthrough and a throw would strand
    // the participant with no onboarding and no path to the survey handoff.
    try {
        const rows = await db
            .select({ data: tutorials.data })
            .from(workspaces)
            .innerJoin(workshops, eq(workspaces.workshopId, workshops.id))
            .innerJoin(tutorials, eq(workshops.tutorialId, tutorials.id))
            .where(eq(workspaces.id, workspaceId))
            .limit(1);
        const assigned = rows[0]?.data as TutorialContent | undefined;
        if (assigned) return assigned;

        const demo = await getTutorialBySlug(PROLIFIC_TUTORIAL_SLUG);
        return (demo?.data as TutorialContent | undefined) ?? PROLIFIC_TUTORIAL_SEED;
    } catch {
        return PROLIFIC_TUTORIAL_SEED;
    }
};

/**
 * The canonical step-id order for a workshop's analytics — the unit ids of the
 * tutorial that workshop actually runs (its assigned tutorial, else the seeded
 * demo). The funnel/check/progress derivations key on this; using it instead of
 * a hard-coded constant keeps analytics correct for custom or edited tutorials.
 */
export const getTutorialStepMetaForWorkshop = async (
    workshopId: string,
): Promise<{ order: string[]; labels: Record<string, string> }> => {
    const rows = await db
        .select({ data: tutorials.data })
        .from(workshops)
        .innerJoin(tutorials, eq(workshops.tutorialId, tutorials.id))
        .where(eq(workshops.id, workshopId))
        .limit(1);
    const assigned = rows[0]?.data as TutorialContent | undefined;
    const content =
        assigned ??
        ((await getTutorialBySlug(PROLIFIC_TUTORIAL_SLUG))?.data as TutorialContent | undefined) ??
        PROLIFIC_TUTORIAL_SEED;
    return {
        order: content.units.map((u) => u.id),
        // id → human title, so analytics labels the funnel/table from the tutorial
        // the workshop actually runs instead of a hard-coded id map that only
        // covers the demo's unit ids.
        labels: Object.fromEntries(content.units.map((u) => [u.id, u.title])),
    };
};

export const getTutorialStepOrderForWorkshop = async (workshopId: string): Promise<string[]> =>
    (await getTutorialStepMetaForWorkshop(workshopId)).order;
