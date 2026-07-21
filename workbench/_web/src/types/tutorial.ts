import type { StepType } from "@reactour/tour";

// Discriminated union types for step triggers
type ClickTrigger = {
    type: "click";
    target: string;
};

type TextInputTrigger = {
    type: "textInput";
    expectedValue: string;
};

type TokenSelectionTrigger = {
    type: "tokenSelection";
    expectedTokenIndex: number;
};

type TokenHighlightTrigger = {
    type: "tokenHighlight";
    expectedTokenIndex: number;
};

type TokenClickTrigger = {
    type: "tokenClick";
    expectedTokenIndex: number;
};

// Advance when a lens run completes. Optional predicate gates on the result
// (e.g. unit 3's "top prediction ≠ 10"); a failed predicate is a hint "attempt".
type RunCompletedTrigger = {
    type: "runCompleted";
    predicate?: (result: unknown) => boolean;
};

// Advance when an activation-patching intervention is applied (unit 4).
type PatchAppliedTrigger = {
    type: "patchApplied";
};

type TutorialStepTrigger =
    | ClickTrigger
    | TextInputTrigger
    | TokenSelectionTrigger
    | TokenHighlightTrigger
    | TokenClickTrigger
    | RunCompletedTrigger
    | PatchAppliedTrigger;

interface ExtendedStepType extends StepType {
    trigger?: TutorialStepTrigger;
    // Canonical unit id (see tutorials/prolificSteps.ts) for the steps that map
    // to a tutorial unit. Drives server-side progress telemetry: the manager
    // records step_started / step_completed keyed by this id as the tour
    // advances. Steps without a stepId (pure UI-explanation steps) emit nothing.
    stepId?: string;
}

interface TutorialChapterProgress {
    title: string;
    steps: ExtendedStepType[];
    currentStep?: number;
    completed: boolean;
}

interface TutorialProgress {
    chapters: TutorialChapterProgress[];
    description: string;
    currentChapter?: number;
}

export type {
    ExtendedStepType,
    TutorialStepTrigger,
    ClickTrigger,
    TextInputTrigger,
    TokenSelectionTrigger,
    TokenHighlightTrigger,
    TokenClickTrigger,
    RunCompletedTrigger,
    PatchAppliedTrigger,
    TutorialChapterProgress,
    TutorialProgress,
};
