"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useDragControls } from "motion/react";
import {
    ChevronDown,
    ChevronRight,
    GripVertical,
    HelpCircle,
    Lightbulb,
    Minus,
    RotateCcw,
    X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useProlificTutorial, HINT_AUTO_OFFER_AT } from "@/stores/useProlificTutorial";
import type { HintRung, SpotlightTarget } from "@/types/tutorial-content";
import { CompletionCta } from "./CompletionCta";

/**
 * The companion "guided tutorial" activity surface. Rendered as a floating,
 * draggable overlay above the patch-lens tool (portaled to <body>) so the
 * participant can position it anywhere and never has to scroll the controls
 * column to see it. Each unit carries: a task, a concept callout, a known-good
 * prompt bank, a progressive hint ladder, an auto-scored embedded check, and an
 * observation box. Content comes from the DB (store.units); every interaction
 * mirrors to tutorial_events via the store (app DB only).
 *
 * Reactour still handles the spotlight explanations for the lens/patch UI; this
 * panel is the reflective "activity" the pilot's facilitator ran by hand.
 */

// Normalize a token/answer for comparison: strip a leading SentencePiece marker
// (▁ U+2581), the heatmap's displayed space glyph (␣ U+2423), an ASCII
// underscore, and whitespace — so "Paris" matches a "␣Paris"/"▁Paris"/"_Paris"
// token however the participant types the leading space.
const norm = (s: string | null | undefined) =>
    (s ?? "")
        .trim()
        .toLowerCase()
        .replace(/^[▁␣_\s]+/, "");

const DEFAULT_POS = { x: 24, y: 96 };

interface TutorialActivityPanelProps {
    onInsertPrompt: (text: string) => void;
    onInsertPatchPair?: (pair: { source: string; target: string }) => void;
    /** Point the widget's spotlight at a cell (show-me hints); null clears it. */
    onSpotlight?: (target: SpotlightTarget | null) => void;
    /** Bumped each time a run completes, so the panel can score the current unit. */
    runNonce: number;
    topToken: string | null;
    secondToken: string | null;
    /** Per-workshop survey the finish screen links to (workshops.surveyUrl). */
    surveyUrl?: string;
    /** Optional per-workshop thank-you copy (legacy completion_text). */
    completionThanks?: string;
}

export function TutorialActivityPanel({
    onInsertPrompt,
    onInsertPatchPair,
    onSpotlight,
    runNonce,
    topToken,
    secondToken,
    surveyUrl,
    completionThanks,
}: TutorialActivityPanelProps) {
    const store = useProlificTutorial();
    const units = store.units;
    const unit = units[store.unitIdx];
    const dragControls = useDragControls();
    const constraintsRef = useRef<HTMLDivElement | null>(null);

    // Portal target — guarded so SSR renders nothing (createPortal needs the DOM).
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    // Feed each completed run into the store's success evaluation exactly once.
    const prevNonce = useRef(runNonce);
    useEffect(() => {
        if (runNonce === prevNonce.current) return;
        prevNonce.current = runNonce;
        if (store.active) store.recordRun(topToken);
        // topToken is captured at the nonce bump; store handles per-unit logic.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runNonce]);

    // Clear any spotlight when the unit changes or the tutorial closes.
    useEffect(() => {
        onSpotlight?.(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store.unitIdx, store.active]);

    if (!mounted || !store.active || !unit) return null;

    const total = units.length;
    const attempts = store.attemptsByUnit[store.unitIdx] ?? 0;
    const hintStage = store.hintStageByUnit[store.unitIdx] ?? 0;
    const completed = store.completedUnits.includes(store.unitIdx);
    const isLast = store.unitIdx === total - 1;
    const initialPos = store.panelPos ?? DEFAULT_POS;

    const header = (
        <div
            className="flex items-center justify-between gap-2 border-b bg-secondary/60 dark:bg-secondary/40 px-3 py-2 rounded-t cursor-grab active:cursor-grabbing"
            onPointerDown={(e) => dragControls.start(e)}
        >
            <div className="flex items-center gap-1.5 min-w-0">
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                <h2 className="text-sm font-medium truncate">{unit.title}</h2>
                {!store.collapsed && (
                    <span className="text-xs text-muted-foreground font-mono tabular-nums shrink-0">
                        Step {store.unitIdx + 1} of {total}
                    </span>
                )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                    title={store.collapsed ? "Expand tutorial" : "Collapse tutorial"}
                    onClick={() => store.setCollapsed(!store.collapsed)}
                >
                    {store.collapsed ? (
                        <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                        <Minus className="h-3.5 w-3.5" />
                    )}
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                    title="Exit tutorial"
                    onClick={store.stop}
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>
        </div>
    );

    return createPortal(
        <div
            ref={constraintsRef}
            className="pointer-events-none fixed inset-0 z-50"
            aria-hidden={false}
        >
            <motion.section
                aria-label="Guided tutorial"
                drag
                dragControls={dragControls}
                dragListener={false}
                dragMomentum={false}
                dragConstraints={constraintsRef}
                dragElastic={0}
                initial={{ x: initialPos.x, y: initialPos.y }}
                onDragEnd={(_e, info) => {
                    store.setPanelPos({
                        x: initialPos.x + info.offset.x,
                        y: initialPos.y + info.offset.y,
                    });
                }}
                style={{ position: "absolute", top: 0, left: 0 }}
                className="pointer-events-auto w-[340px] max-w-[calc(100vw-2rem)] rounded border bg-background shadow-lg flex flex-col max-h-[calc(100vh-8rem)]"
            >
                {header}

                {!store.collapsed && (
                    <div className="p-3 flex flex-col gap-3 overflow-auto">
                        {/* Task */}
                        <p className="text-sm leading-snug">{unit.task}</p>

                        {/* Concept callout — the facilitator move this unit replaces. */}
                        <div className="rounded border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm leading-snug">
                            {unit.concept}
                        </div>

                        {/* Prompt bank */}
                        {unit.prompts.length > 0 && (
                            <div className="flex flex-col gap-1.5">
                                <p className="text-xs font-medium text-muted-foreground">
                                    Try a prompt
                                </p>
                                <div className="flex flex-col gap-1">
                                    {unit.prompts.map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() => onInsertPrompt(p)}
                                            className="text-left text-xs font-mono rounded border bg-background px-2 py-1 hover:border-primary/50 transition-colors whitespace-pre-wrap"
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                                {unit.patchPair && onInsertPatchPair && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="mt-1 h-7 text-xs"
                                        onClick={() => onInsertPatchPair(unit.patchPair!)}
                                    >
                                        Load source + target pair
                                    </Button>
                                )}
                            </div>
                        )}

                        {/* Progressive hints */}
                        <HintLadder
                            key={`hint-${store.unitIdx}`}
                            hints={unit.hints}
                            revealedStage={hintStage}
                            autoOffer={attempts >= HINT_AUTO_OFFER_AT && hintStage === 0}
                            onReveal={() => {
                                const stage = store.revealHint();
                                const rung = unit.hints.find((h) => h.stage === stage);
                                if (rung?.insertPrompt) onInsertPrompt(rung.insertPrompt);
                                if (rung?.spotlight) onSpotlight?.(rung.spotlight);
                            }}
                        />

                        {/* Embedded check — auto-scored, log-only */}
                        {unit.check && (
                            <EmbeddedCheck
                                key={`check-${store.unitIdx}`}
                                question={unit.check.question}
                                expected={
                                    unit.check.kind === "secondToken" ? secondToken : topToken
                                }
                                placeholder={unit.answerPlaceholder}
                                hasRun={topToken != null}
                                onAnswer={(answer, correct) => store.answerCheck(answer, correct)}
                                alreadyAnswered={!!store.checkAnsweredByUnit[store.unitIdx]}
                            />
                        )}

                        {/* Observation box */}
                        <ObservationBox
                            key={`obs-${store.unitIdx}`}
                            prompt={unit.observationPrompt}
                            placeholder={unit.observationPlaceholder}
                            submitted={!!store.observationByUnit[store.unitIdx]}
                            onSubmit={(text) => store.submitObservation(text)}
                        />

                        {/* FAQ callouts */}
                        {unit.faqs && unit.faqs.length > 0 && <FaqCallouts faqs={unit.faqs} />}

                        {/* Reset / fresh-start */}
                        <button
                            type="button"
                            onClick={() => onInsertPrompt("")}
                            className="flex items-center gap-1 self-start text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
                            title="Clear the prompt — a fresh start means an empty context"
                        >
                            <RotateCcw className="h-3 w-3" />
                            Start this step fresh (empty context)
                        </button>

                        {/* Finish screen on the final unit → survey handoff */}
                        {isLast && (completed || store.observationByUnit[store.unitIdx]) && (
                            <CompletionCta surveyUrl={surveyUrl} thanks={completionThanks} />
                        )}

                        {/* Nav */}
                        <div className="flex items-center justify-between border-t pt-3">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                disabled={store.unitIdx === 0}
                                onClick={store.prev}
                            >
                                Back
                            </Button>
                            <div className="flex items-center gap-1.5">
                                {completed && (
                                    <span className="text-xs text-primary">✓ Step complete</span>
                                )}
                                {!isLast && (
                                    <Button size="sm" className="h-7 text-xs" onClick={store.next}>
                                        Next step
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </motion.section>
        </div>,
        document.body,
    );
}

// ---- sub-components ----

function HintLadder({
    hints,
    revealedStage,
    autoOffer,
    onReveal,
}: {
    hints: HintRung[];
    revealedStage: number;
    autoOffer: boolean;
    onReveal: () => void;
}) {
    const maxStage = hints.length;
    const revealed = hints.filter((h) => h.stage <= revealedStage);
    return (
        <div className="flex flex-col gap-1.5">
            {revealed.map((h) => (
                <p
                    key={h.stage}
                    className="flex items-start gap-1.5 text-xs text-muted-foreground leading-snug"
                >
                    <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5 text-yellow-500" />
                    <span>{h.text}</span>
                </p>
            ))}
            {revealedStage < maxStage && (
                <button
                    type="button"
                    onClick={onReveal}
                    className={`flex items-center gap-1 self-start text-xs transition-colors ${
                        autoOffer
                            ? "text-yellow-600 dark:text-yellow-500 font-medium"
                            : "text-muted-foreground/60 hover:text-foreground"
                    }`}
                >
                    <HelpCircle className="h-3 w-3" />
                    {autoOffer
                        ? "Stuck? Get a hint"
                        : revealedStage === 0
                          ? "Stuck? Get a hint"
                          : "Another hint"}
                </button>
            )}
        </div>
    );
}

function EmbeddedCheck({
    question,
    expected,
    placeholder,
    hasRun,
    alreadyAnswered,
    onAnswer,
}: {
    question: string;
    expected: string | null;
    placeholder?: string;
    hasRun: boolean;
    alreadyAnswered: boolean;
    onAnswer: (answer: string, correct: boolean) => void;
}) {
    const [value, setValue] = useState("");
    const [result, setResult] = useState<null | { correct: boolean }>(null);
    // Lock once answered — locally this render or already answered on a prior
    // visit (checkAnsweredByUnit). Prevents a re-answer from emitting a duplicate
    // check_answered event that would skew the analytics funnel.
    const locked = !!result || alreadyAnswered;

    const submit = () => {
        if (!value.trim() || locked) return;
        const correct = norm(value) === norm(expected);
        setResult({ correct });
        onAnswer(value.trim(), correct);
    };

    return (
        <div className="rounded border bg-background p-2.5 flex flex-col gap-1.5">
            <p className="text-xs font-medium">{question}</p>
            {!hasRun ? (
                <p className="text-xs text-muted-foreground">Run a prompt first, then answer.</p>
            ) : (
                <>
                    <div className="flex items-center gap-1.5">
                        <Input
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && submit()}
                            placeholder={placeholder ?? "Your answer"}
                            aria-label={question}
                            className="h-7 text-xs"
                            disabled={locked}
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={submit}
                            disabled={locked || !value.trim()}
                        >
                            Check
                        </Button>
                    </div>
                    {result && (
                        <p
                            className={`text-xs ${result.correct ? "text-primary" : "text-muted-foreground"}`}
                        >
                            {result.correct
                                ? "✓ Correct."
                                : `Not quite — the model's answer was “${expected ?? "?"}”.`}
                        </p>
                    )}
                    {alreadyAnswered && !result && (
                        <p className="text-xs text-muted-foreground">Already answered this step.</p>
                    )}
                </>
            )}
        </div>
    );
}

function ObservationBox({
    prompt,
    placeholder,
    submitted,
    onSubmit,
}: {
    prompt: string;
    placeholder?: string;
    submitted: boolean;
    onSubmit: (text: string) => void;
}) {
    const [value, setValue] = useState("");
    const [done, setDone] = useState(submitted);
    const fieldId = useId();

    const submit = () => {
        if (!value.trim()) return;
        onSubmit(value.trim());
        setDone(true);
    };

    if (done) {
        return (
            <div className="rounded border border-primary/30 bg-primary/5 p-2.5">
                <p className="text-xs font-medium">{prompt}</p>
                <p className="mt-1 text-xs text-primary">✓ Thanks — your note was saved.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1.5">
            <label htmlFor={fieldId} className="text-xs font-medium">
                {prompt}
            </label>
            <Textarea
                id={fieldId}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                }}
                placeholder={placeholder ?? "What did you notice? (⌘/Ctrl-Enter to save)"}
                className="min-h-16 text-xs"
            />
            <Button
                size="sm"
                variant="outline"
                className="h-7 self-end text-xs"
                onClick={submit}
                disabled={!value.trim()}
            >
                Save note
            </Button>
        </div>
    );
}

function FaqCallouts({ faqs }: { faqs: { q: string; a: string }[] }) {
    const [open, setOpen] = useState<number | null>(null);
    return (
        <div className="flex flex-col gap-1">
            {faqs.map((f, i) => (
                <div key={f.q} className="rounded border bg-background">
                    <button
                        type="button"
                        onClick={() => setOpen(open === i ? null : i)}
                        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs font-medium"
                    >
                        {open === i ? (
                            <ChevronDown className="h-3 w-3 shrink-0" />
                        ) : (
                            <ChevronRight className="h-3 w-3 shrink-0" />
                        )}
                        Curious? {f.q}
                    </button>
                    {open === i && (
                        <p className="px-2 pb-2 pl-6 text-xs text-muted-foreground leading-snug">
                            {f.a}
                        </p>
                    )}
                </div>
            ))}
        </div>
    );
}
