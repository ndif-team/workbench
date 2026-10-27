import { useCallback } from "react";
import { useTour } from "@reactour/tour";
import type { ExtendedStepType } from "@/types/tutorial";

// Discriminated union types for tutorial events
type ClickEvent = {
    type: "click";
    target: string;
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

type TutorialEventData = ClickEvent | RunCompletedEvent | PatchAppliedEvent;

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

                case "runCompleted":
                    shouldAdvance =
                        eventData.type === "runCompleted" &&
                        (trigger.predicate ? trigger.predicate(eventData.result) : true);
                    break;

                case "patchApplied":
                    shouldAdvance = eventData.type === "patchApplied";
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

    return {
        isOpen,
        currentStep,
        handleClick,
        // Generic dispatch — lets an event-bus provider forward any event without
        // knowing which handler maps to it.
        emit: checkStepCompletion,
    };
}

export type { TutorialEventData };
