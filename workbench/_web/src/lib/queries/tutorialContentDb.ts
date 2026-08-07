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

const validGrids: Set<unknown> = new Set(["source", "target", "result"]);
/**
 * A spotlight layer/position: a concrete grid index, or "last" (resolved by the
 * widget). A negative or fractional index is not a cell — the widget snaps a
 * layer to the nearest rendered one, so a negative layer would silently ring the
 * first row instead of failing.
 */
const isCellIndex = (v: unknown): boolean =>
    v === "last" || (typeof v === "number" && Number.isInteger(v) && v >= 0);
/**
 * A text field the panel renders as-is. Authored JSON can hold anything here, and
 * React throws on an object child — so a wrong type has to fail at authoring time,
 * not in front of a participant.
 */
const isText = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

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
    const validCheckKinds = new Set(["topToken", "secondToken", "choice"]);
    for (const u of content.units) {
        if (!isText(u.id) || !isText(u.title)) {
            throw new Error("Every unit needs an id and a title");
        }
        if (u.id.length > 64) {
            throw new Error(`Unit id "${u.id}" exceeds 64 characters`);
        }
        if (!Array.isArray(u.prompts) || !u.prompts.every(isText)) {
            throw new Error(`Unit "${u.id}" needs a prompts array of non-empty strings`);
        }
        if (!Array.isArray(u.hints)) {
            throw new Error(`Unit "${u.id}" needs a hints array`);
        }
        // Rendered straight into the panel, and `prompts` / `patchPair` are also
        // read by promptsForUnitEntry from inside an effect — where a non-string
        // would throw past the tutorial and take the whole chart page with it.
        for (const field of ["task", "concept", "observationPrompt"] as const) {
            if (!isText(u[field])) {
                throw new Error(`Unit "${u.id}" needs a non-empty ${field}`);
            }
        }
        // Optional, but if present it is rendered — so an empty string or a
        // non-string has to fail here rather than put a blank callout (or a React
        // "objects are not valid as a child" throw) in front of a participant.
        for (const field of ["why", "tryYourOwn"] as const) {
            if (u[field] !== undefined && !isText(u[field])) {
                throw new Error(`Unit "${u.id}" ${field} must be non-empty text when present`);
            }
        }
        if (u.patchPair !== undefined) {
            if (!isText(u.patchPair?.source) || !isText(u.patchPair?.target)) {
                throw new Error(`Unit "${u.id}" patchPair needs a source and a target prompt`);
            }
        }
        if (u.faqs !== undefined) {
            if (!Array.isArray(u.faqs)) {
                throw new Error(`Unit "${u.id}" faqs must be an array`);
            }
            for (const f of u.faqs) {
                if (!isText(f?.q) || !isText(f?.a)) {
                    throw new Error(`Unit "${u.id}" has an FAQ missing its question or answer`);
                }
            }
        }
        // A spotlight the widget can't resolve silently highlights nothing — for a
        // hint, exactly the rung a stuck participant reached for; for a unit, the
        // cells its instructions tell them to drag between.
        const checkSpotlights = (cells: unknown[], where: string) => {
            for (const s of cells as { grid?: unknown; layer?: unknown; position?: unknown }[]) {
                if (
                    !validGrids.has(s?.grid) ||
                    !isCellIndex(s?.layer) ||
                    !isCellIndex(s?.position)
                ) {
                    throw new Error(
                        `Unit "${u.id}" ${where} has a malformed spotlight (needs grid source|target|result and a non-negative integer or "last" layer/position)`,
                    );
                }
            }
        };
        if (u.spotlights !== undefined) {
            if (!Array.isArray(u.spotlights) || u.spotlights.length === 0) {
                throw new Error(`Unit "${u.id}" spotlights must be a non-empty array`);
            }
            checkSpotlights(u.spotlights, "spotlights");
        }
        for (const h of u.hints) {
            if (typeof h?.stage !== "number" || typeof h?.text !== "string") {
                throw new Error(`Unit "${u.id}" has a malformed hint rung`);
            }
            checkSpotlights(
                [...(h.spotlights ?? []), ...(h.spotlight ? [h.spotlight] : [])],
                `hint ${h.stage}`,
            );
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
        if (u.check) {
            if (!validCheckKinds.has(u.check.kind)) {
                throw new Error(`Unit "${u.id}" has an unsupported check kind "${u.check.kind}"`);
            }
            if (!isText(u.check.question)) {
                throw new Error(`Unit "${u.id}" check needs a question`);
            }
        }
        // A choice check is scored entirely from its own content, so a missing or
        // out-of-range key would mark every participant wrong with no run to blame.
        if (u.check?.kind === "choice") {
            const { options, correctIndex } = u.check;
            if (!Array.isArray(options) || options.length < 2 || !options.every(isText)) {
                throw new Error(`Unit "${u.id}" choice check needs at least two non-empty options`);
            }
            if (
                !Number.isInteger(correctIndex) ||
                correctIndex < 0 ||
                correctIndex >= options.length
            ) {
                throw new Error(
                    `Unit "${u.id}" choice check needs a correctIndex within its options`,
                );
            }
        }
    }
    if (content.glossary !== undefined) {
        if (!Array.isArray(content.glossary)) {
            throw new Error("Tutorial glossary must be an array");
        }
        for (const g of content.glossary) {
            if (!isText(g?.term) || !isText(g?.definition)) {
                throw new Error("Every glossary entry needs a term and a definition");
            }
        }
    }
    // The welcome slideshow is the first thing a participant sees, and it is modal
    // — a slide that renders blank (or throws) blocks the tutorial behind it rather
    // than degrading. An empty `slides` array would open a dialog with no content
    // and no way past it, so require at least one slide with something on it.
    if (content.welcome !== undefined) {
        const { slides, tourCta } = content.welcome;
        if (!Array.isArray(slides) || slides.length === 0) {
            throw new Error("Tutorial welcome needs at least one slide");
        }
        for (const [i, s] of slides.entries()) {
            if (!isText(s?.title)) {
                throw new Error(`Welcome slide ${i + 1} needs a title`);
            }
            if (s.body !== undefined && !isText(s.body)) {
                throw new Error(`Welcome slide "${s.title}" body must be non-empty text`);
            }
            if (s.cards !== undefined) {
                if (!Array.isArray(s.cards) || s.cards.length === 0) {
                    throw new Error(`Welcome slide "${s.title}" cards must be a non-empty array`);
                }
                for (const c of s.cards) {
                    if (!isText(c?.term) || !isText(c?.definition)) {
                        throw new Error(
                            `Welcome slide "${s.title}" has a card missing its term or definition`,
                        );
                    }
                }
            }
            if (s.body === undefined && s.cards === undefined) {
                throw new Error(`Welcome slide "${s.title}" needs a body or cards`);
            }
        }
        if (tourCta !== undefined && !isText(tourCta)) {
            throw new Error("Tutorial welcome tourCta must be non-empty text when present");
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
