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

type TutorialStepTrigger =
  | ClickTrigger
  | TextInputTrigger
  | TokenSelectionTrigger
  | TokenHighlightTrigger
  | TokenClickTrigger;

interface ExtendedStepType extends StepType {
  trigger?: TutorialStepTrigger;
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
  TutorialChapterProgress,
  TutorialProgress,
};
