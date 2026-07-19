import { useCallback } from "react";
import { useTour } from "@reactour/tour";
import type { ExtendedStepType } from "@/types/tutorial";

// Discriminated union types for tutorial events
type ClickEvent = {
    type: "click";
    target: string;
};

type TextInputEvent = {
    type: "textInput";
    value: string;
};

type TokenHighlightEvent = {
    type: "tokenHighlight";
    tokenIndex: number;
};

type TokenClickEvent = {
    type: "tokenClick";
    tokenIndex: number;
};

// A lens run finished; `result` is passed to a runCompleted trigger's predicate.
type RunCompletedEvent = {
    type: "runCompleted";
    result: unknown;
};

// An activation-patching intervention was applied.
type PatchAppliedEvent = {
    type: "patchApplied";
};

// The participant submitted free text (observation box).
type TextSubmitEvent = {
    type: "textSubmit";
    value: string;
};

type TutorialEventData =
    | ClickEvent
    | TextInputEvent
    | TokenHighlightEvent
    | TokenClickEvent
    | RunCompletedEvent
    | PatchAppliedEvent
    | TextSubmitEvent;

export function useTutorialManager() {
    const { setCurrentStep, currentStep, isOpen, steps } = useTour();

    const checkStepCompletion = useCallback(
        (eventData: TutorialEventData) => {
            if (!isOpen || !steps || currentStep >= steps.length) return;

            const currentStepData = steps[currentStep] as ExtendedStepType;
            const trigger = currentStepData?.trigger;

            if (!trigger) return;

            let shouldAdvance = false;

            switch (trigger.type) {
                case "click":
                    shouldAdvance =
                        eventData.type === "click" && eventData.target === trigger.target;
                    break;

                case "textInput":
                    shouldAdvance =
                        eventData.type === "textInput" && eventData.value === trigger.expectedValue;
                    break;

                case "tokenHighlight":
                    shouldAdvance =
                        eventData.type === "tokenHighlight" &&
                        eventData.tokenIndex === trigger.expectedTokenIndex;
                    break;

                case "tokenClick":
                    shouldAdvance =
                        eventData.type === "tokenClick" &&
                        eventData.tokenIndex === trigger.expectedTokenIndex;
                    break;

                case "runCompleted":
                    shouldAdvance =
                        eventData.type === "runCompleted" &&
                        (trigger.predicate ? trigger.predicate(eventData.result) : true);
                    break;

                case "patchApplied":
                    shouldAdvance = eventData.type === "patchApplied";
                    break;

                case "textSubmit":
                    shouldAdvance =
                        eventData.type === "textSubmit" &&
                        eventData.value.trim().length >= (trigger.minLength ?? 1);
                    break;
            }

            if (shouldAdvance) {
                // Small delay to ensure smooth transitions
                setTimeout(() => {
                    setCurrentStep(currentStep + 1);
                }, 150);
            }
        },
        [isOpen, steps, currentStep, setCurrentStep],
    );

    // Event handlers for different trigger types
    const handleClick = useCallback(
        (target: string) => {
            checkStepCompletion({
                type: "click",
                target,
            });
        },
        [checkStepCompletion],
    );

    const handleTextInput = useCallback(
        (value: string) => {
            checkStepCompletion({
                type: "textInput",
                value,
            });
        },
        [checkStepCompletion],
    );

    const handleTokenHighlight = useCallback(
        (tokenIndex: number) => {
            checkStepCompletion({
                type: "tokenHighlight",
                tokenIndex,
            });
        },
        [checkStepCompletion],
    );

    const handleTokenClick = useCallback(
        (tokenIndex: number) => {
            checkStepCompletion({
                type: "tokenClick",
                tokenIndex,
            });
        },
        [checkStepCompletion],
    );

    const handleRunCompleted = useCallback(
        (result: unknown) => {
            checkStepCompletion({ type: "runCompleted", result });
        },
        [checkStepCompletion],
    );

    const handlePatchApplied = useCallback(() => {
        checkStepCompletion({ type: "patchApplied" });
    }, [checkStepCompletion]);

    const handleTextSubmit = useCallback(
        (value: string) => {
            checkStepCompletion({ type: "textSubmit", value });
        },
        [checkStepCompletion],
    );

    return {
        isOpen,
        currentStep,
        handleClick,
        handleTextInput,
        handleTokenHighlight,
        handleTokenClick,
        handleRunCompleted,
        handlePatchApplied,
        handleTextSubmit,
        // Generic dispatch — lets an event-bus provider forward any event without
        // knowing which handler maps to it.
        emit: checkStepCompletion,
    };
}

export type { TutorialEventData };
