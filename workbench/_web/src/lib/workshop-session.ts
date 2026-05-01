/**
 * Workshop session helpers — shared types/constants for the anonymous-cookie
 * identity used by Workshop Mode. Server actions (`@/actions/workshop`) own
 * the cookie set/get; this module exists so both the server actions and the
 * (future) export pipeline reference the same constants.
 */

export const WORKSHOP_SESSION_COOKIE = "workshop_session_id";

/** Curated examples that Workshop Mode renders, in pilot Movement-2 order. */
export const WORKSHOP_TASK_EXAMPLES = {
    branching: ["branching_demo_workshop", "branching_demo_fixture"] as string[],
    task1_logit_lens: [
        "task1_ex1_51st_state",
        "task1_ex2_mri_inventor",
        "task1_ex3_bandura_paper",
        "task1_ex4_lamarr_coinventor",
        "task1_ex5_higgs_boson",
        "task1_ex6_foucault_surveillance",
        "commitment_strip_fixture",
    ] as string[],
    // Tasks 2 and 3 (activation patching, PatchScope) reuse the existing
    // Workbench tools and don't define new INIF record types in Phase 1.
    task2_patching: [] as string[],
    task3_patchscope: [] as string[],
} as const;

export type WorkshopTaskKey = keyof typeof WORKSHOP_TASK_EXAMPLES;

/** Display labels for the task header. */
export const WORKSHOP_TASK_LABELS: Record<WorkshopTaskKey, string> = {
    branching: "Movement 2 opener — Branching Generations",
    task1_logit_lens: "Task 1 — Hallucination probe (logit lens)",
    task2_patching: "Task 2 — Bias intervention (activation patching)",
    task3_patchscope: "Task 3 — Knowledge probe (PatchScope)",
};
