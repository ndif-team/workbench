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

type TutorialEventData = ClickEvent | TextInputEvent | TokenHighlightEvent | TokenClickEvent;

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

    return {
        isOpen,
        currentStep,
        handleClick,
        handleTextInput,
        handleTokenHighlight,
        handleTokenClick,
    };
}
