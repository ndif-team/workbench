"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveWorkshopAnnotation } from "@/actions/workshop";

interface CriticalFramingPromptProps {
    exampleId: string;
    promptText: string;
    initialResponse: string;
}

const MIN_LEN = 10;

/**
 * Critical-framing prompt component (spec §0.4). The prompt text is hidden
 * until the participant clicks "I see it" — surfacing it before observation
 * would prime them.
 */
export function CriticalFramingPrompt({
    exampleId,
    promptText,
    initialResponse,
}: CriticalFramingPromptProps) {
    const [revealed, setRevealed] = useState(initialResponse.length > 0);
    const [response, setResponse] = useState(initialResponse);
    const [saving, setSaving] = useState(false);
    const [savedFlash, setSavedFlash] = useState(false);

    const onReveal = () => {
        setRevealed(true);
    };

    const onSave = async () => {
        setSaving(true);
        await saveWorkshopAnnotation({ exampleId, framingResponse: response });
        setSaving(false);
        setSavedFlash(true);
        setTimeout(() => setSavedFlash(false), 1200);
    };

    if (!revealed) {
        return (
            <section data-testid="critical-framing" data-state="hidden">
                <Button
                    type="button"
                    variant="default"
                    data-testid="critical-framing-reveal"
                    onClick={onReveal}
                >
                    I see it
                </Button>
            </section>
        );
    }

    return (
        <section
            data-testid="critical-framing"
            data-state="revealed"
            className="rounded-md border bg-card p-4 flex flex-col gap-3"
        >
            <p
                data-testid="critical-framing-text"
                className="text-sm leading-relaxed font-medium"
            >
                {promptText}
            </p>
            <Textarea
                data-testid="critical-framing-response"
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="A sentence or two of your response."
                rows={3}
            />
            <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                    {response.trim().length < MIN_LEN
                        ? `${MIN_LEN - response.trim().length} more characters to enable Save`
                        : savedFlash
                          ? "Saved."
                          : ""}
                </span>
                <Button
                    type="button"
                    data-testid="critical-framing-save"
                    onClick={onSave}
                    disabled={response.trim().length < MIN_LEN || saving}
                >
                    Save
                </Button>
            </div>
        </section>
    );
}
