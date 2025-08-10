"use client";

import { Textarea } from "@/components/ui/textarea";
import PatchControls from "./PatchControls";
import PatchProvider, { usePatch } from "./PatchProvider";
import TokenStrip from "./TokenStrip";

function InnerSimplePatchArea() {
    const {
        sourceText,
        destText,
        setSourceText,
        setDestText,
        isEditing,
        setIsEditing,
        notAligned,
        isAlignMode,
    } = usePatch();

    return (
        <div className="flex flex-col p-2 gap-2">
            <PatchControls isEditing={isEditing} setIsEditing={setIsEditing} />

            {isEditing ? (
                <div className="flex flex-col gap-2">
                    <Textarea
                        value={sourceText}
                        onChange={(e) => setSourceText(e.target.value)}
                        className="h-40"
                        placeholder="Source prompt"
                    />
                    <Textarea
                        value={destText}
                        onChange={(e) => setDestText(e.target.value)}
                        className="h-40"
                        placeholder="Destination prompt"
                    />
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {isAlignMode && notAligned && (
                        <div className="text-amber-600 text-sm">Not aligned: group counts do not match</div>
                    )}
                    <div className="flex flex-col w-full px-3 py-2 border rounded bg-card">
                        <TokenStrip side="source" />
                    </div>
                    <div className="flex flex-col w-full px-3 py-2 border rounded bg-card">
                        <TokenStrip side="destination" />
                    </div>
                </div>
            )}
        </div>
    );
}

export default function SimplePatchArea() {
    return (
        <PatchProvider>
            <InnerSimplePatchArea />
        </PatchProvider>
    );
}