"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { useTour } from "@reactour/tour";

import { useTutorialManager, type TutorialEventData } from "@/hooks/useTutorialManager";
import { recordTutorialEvent } from "@/lib/queries/tutorialEventsQueries";
import type { ExtendedStepType } from "@/types/tutorial";
import type { TutorialEventPayload, TutorialEventType } from "@/types/tutorialEvents";

/**
 * The missing wire between the tour and the app. Historically useTutorialManager
 * was imported nowhere, so trigger fields never fired — the tour advanced only
 * via the popover's Next button. This provider:
 *
 *  1. instantiates the manager once and exposes `emit` so the patch-lens emit
 *     sites (run completed, patch applied, observation submitted) can advance
 *     trigger-gated steps, and
 *  2. records server-side progress (step_started / step_completed) to
 *     tutorial_events as the tour moves between steps, keyed by each step's
 *     canonical `stepId`. This replaces the localStorage-only completion flag as
 *     the source of truth (the analytics dashboard reads these rows).
 *
 * Mount it inside the patch-lens route, under the app's TourProvider.
 */

interface TutorialEventContextValue {
    emit: (event: TutorialEventData) => void;
    isOpen: boolean;
    currentStep: number;
    /** Record a non-advancing telemetry event (hint_shown, check_answered, observation_submitted). */
    record: (stepId: string, eventType: TutorialEventType, payload?: TutorialEventPayload) => void;
}

const TutorialEventContext = createContext<TutorialEventContextValue | null>(null);

export function TutorialEventProvider({ children }: { children: ReactNode }) {
    const manager = useTutorialManager();
    const { steps } = useTour();
    const { workspaceId } = useParams<{ workspaceId: string }>();

    // Fire-and-forget telemetry write; the tour never blocks on it.
    const record = useMemo(
        () => (stepId: string, eventType: TutorialEventType, payload?: TutorialEventPayload) => {
            if (!workspaceId || !stepId) return;
            void recordTutorialEvent({ workspaceId, stepId, eventType, payload }).catch(() => {
                // Telemetry is best-effort; a dropped event must never surface
                // to the participant mid-tutorial.
            });
        },
        [workspaceId],
    );

    // Record progress as the tour advances. Watching currentStep (rather than the
    // trigger path) captures both manual Next and trigger-driven advances, and
    // the step_completed for the step we just left.
    const prevStepRef = useRef<number | null>(null);
    useEffect(() => {
        if (!manager.isOpen) {
            prevStepRef.current = null;
            return;
        }
        const cur = manager.currentStep;
        if (prevStepRef.current === cur) return;

        const stepIdAt = (i: number) => (steps?.[i] as ExtendedStepType | undefined)?.stepId;

        // Completing the step we advanced away from (only on forward motion).
        const prev = prevStepRef.current;
        if (prev != null && cur > prev) {
            const prevId = stepIdAt(prev);
            if (prevId) record(prevId, "step_completed");
        }
        // Starting the step we just landed on.
        const curId = stepIdAt(cur);
        if (curId) record(curId, "step_started");

        prevStepRef.current = cur;
    }, [manager.isOpen, manager.currentStep, steps, record]);

    const value = useMemo<TutorialEventContextValue>(
        () => ({
            emit: manager.emit,
            isOpen: manager.isOpen,
            currentStep: manager.currentStep,
            record,
        }),
        [manager.emit, manager.isOpen, manager.currentStep, record],
    );

    return <TutorialEventContext.Provider value={value}>{children}</TutorialEventContext.Provider>;
}

/**
 * Emit tutorial events from anywhere inside the patch-lens route. Returns a no-op
 * emitter when used outside the provider so emit sites don't need to null-check
 * (e.g. the non-workshop patch-lens view without a mounted provider).
 */
export function useTutorialEmit(): TutorialEventContextValue {
    return (
        useContext(TutorialEventContext) ?? {
            emit: () => {},
            isOpen: false,
            currentStep: 0,
            record: () => {},
        }
    );
}
