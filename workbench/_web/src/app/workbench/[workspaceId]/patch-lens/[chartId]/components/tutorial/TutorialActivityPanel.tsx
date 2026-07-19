"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, HelpCircle, Lightbulb, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useProlificTutorial, HINT_AUTO_OFFER_AT } from "@/stores/useProlificTutorial";
import { TUTORIAL_UNITS } from "@/tutorials/prolificUnits";
import { CompletionCode } from "./CompletionCode";

/**
 * The companion "guided tutorial" activity surface (spec §4). Rendered in the
 * patch-lens controls column while the Prolific tutorial is active. Each unit
 * carries: a task, a concept callout (the facilitator sentence it replaces), a
 * known-good prompt bank, a progressive hint ladder, an auto-scored embedded
 * check, and an observation box. Every interaction mirrors to tutorial_events
 * via the store (app DB only).
 *
 * Reactour still handles the spotlight explanations for the lens/patch UI; this
 * panel is the reflective "activity" the pilot's facilitator ran by hand.
 */

const norm = (s: string | null | undefined) =>
    (s ?? "")
        .trim()
        .toLowerCase()
        .replace(/^[▁\s]+/, "");

interface TutorialActivityPanelProps {
    onInsertPrompt: (text: string) => void;
    onInsertPatchPair?: (pair: { source: string; target: string }) => void;
    /** Bumped each time a run completes, so the panel can score the current unit. */
    runNonce: number;
    topToken: string | null;
    secondToken: string | null;
    /** Per-workshop finish text (workshops.completion_text), shown on the last unit. */
    completionText?: string;
}

export function TutorialActivityPanel({
    onInsertPrompt,
    onInsertPatchPair,
    runNonce,
    topToken,
    secondToken,
    completionText,
}: TutorialActivityPanelProps) {
    const store = useProlificTutorial();
    const unit = TUTORIAL_UNITS[store.unitIdx];

    // Feed each completed run into the store's success evaluation exactly once.
    const prevNonce = useRef(runNonce);
    useEffect(() => {
        if (runNonce === prevNonce.current) return;
        prevNonce.current = runNonce;
        if (store.active) store.recordRun(topToken);
        // topToken is captured at the nonce bump; store handles per-unit logic.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runNonce]);

    if (!store.active || !unit) return null;

    const total = TUTORIAL_UNITS.length;
    const attempts = store.attemptsByUnit[store.unitIdx] ?? 0;
    const hintStage = store.hintStageByUnit[store.unitIdx] ?? 0;
    const completed = store.completedUnits.includes(store.unitIdx);
    const isLast = store.unitIdx === total - 1;

    return (
        <section
            aria-label="Guided tutorial"
            className="rounded border bg-secondary/40 dark:bg-secondary/30 flex flex-col"
        >
            <div className="p-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">{unit.title}</h3>
                    <span className="text-xs text-muted-foreground tabular-nums">
                        Step {store.unitIdx + 1} of {total}
                    </span>
                </div>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground/50 hover:text-foreground"
                    title="Exit tutorial"
                    onClick={store.stop}
                >
                    <X className="h-3.5 w-3.5" />
                </Button>
            </div>

            <div className="p-3 flex flex-col gap-3">
                {/* Task */}
                <p className="text-sm leading-snug">{unit.task}</p>

                {/* Concept callout — the facilitator move this unit replaces. */}
                <div className="rounded border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm leading-snug">
                    {unit.concept}
                </div>

                {/* Prompt bank (§4.1) */}
                {unit.prompts.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                        <p className="text-xs font-medium text-muted-foreground">Try a prompt</p>
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

                {/* Progressive hints (§4.3) */}
                <HintLadder
                    key={`hint-${store.unitIdx}`}
                    hints={unit.hints}
                    revealedStage={hintStage}
                    autoOffer={attempts >= HINT_AUTO_OFFER_AT && hintStage === 0}
                    onReveal={() => {
                        const stage = store.revealHint();
                        const rung = unit.hints.find((h) => h.stage === stage);
                        if (rung?.insertPrompt) onInsertPrompt(rung.insertPrompt);
                    }}
                />

                {/* Embedded check (§4.7) — auto-scored, log-only */}
                {unit.check && (
                    <EmbeddedCheck
                        key={`check-${store.unitIdx}`}
                        question={unit.check.question}
                        expected={unit.check.kind === "secondToken" ? secondToken : topToken}
                        hasRun={topToken != null}
                        onAnswer={(answer, correct) => store.answerCheck(answer, correct)}
                        alreadyAnswered={!!store.checkAnsweredByUnit[store.unitIdx]}
                    />
                )}

                {/* Observation box (§4.4) */}
                <ObservationBox
                    key={`obs-${store.unitIdx}`}
                    prompt={unit.observationPrompt}
                    submitted={!!store.observationByUnit[store.unitIdx]}
                    onSubmit={(text) => store.submitObservation(text)}
                />

                {/* FAQ callouts (§4.6) */}
                {unit.faqs && unit.faqs.length > 0 && <FaqCallouts faqs={unit.faqs} />}

                {/* Reset / fresh-start (§4.5) */}
                <button
                    type="button"
                    onClick={() => onInsertPrompt("")}
                    className="flex items-center gap-1 self-start text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
                    title="Clear the prompt — a fresh start means an empty context"
                >
                    <RotateCcw className="h-3 w-3" />
                    Start this step fresh (empty context)
                </button>

                {/* Completion code on the final unit (§3.8) */}
                {isLast && (completed || store.observationByUnit[store.unitIdx]) && (
                    <CompletionCode text={completionText} />
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
                        {completed && <span className="text-xs text-primary">✓ Step complete</span>}
                        {!isLast && (
                            <Button size="sm" className="h-7 text-xs" onClick={store.next}>
                                Next step
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}

// ---- sub-components ----

function HintLadder({
    hints,
    revealedStage,
    autoOffer,
    onReveal,
}: {
    hints: { stage: number; text: string }[];
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
    hasRun,
    alreadyAnswered,
    onAnswer,
}: {
    question: string;
    expected: string | null;
    hasRun: boolean;
    alreadyAnswered: boolean;
    onAnswer: (answer: string, correct: boolean) => void;
}) {
    const [value, setValue] = useState("");
    const [result, setResult] = useState<null | { correct: boolean }>(null);

    const submit = () => {
        if (!value.trim()) return;
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
                            placeholder="Your answer"
                            className="h-7 text-xs"
                            disabled={!!result}
                        />
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={submit}
                            disabled={!!result || !value.trim()}
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
    submitted,
    onSubmit,
}: {
    prompt: string;
    submitted: boolean;
    onSubmit: (text: string) => void;
}) {
    const [value, setValue] = useState("");
    const [done, setDone] = useState(submitted);

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
            <label className="text-xs font-medium">{prompt}</label>
            <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                }}
                placeholder="What did you notice? (⌘/Ctrl-Enter to save)"
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
