import { Button } from "@/components/ui/button";
import { GitCompareArrows, Pencil, Route, Scissors, Link as LinkIcon } from "lucide-react";
import { usePatch } from "./PatchProvider";

interface PatchControlsProps {
    isEditing: boolean;
    setIsEditing: (isEditing: boolean) => void;
}

export default function PatchControls({ isEditing, setIsEditing }: PatchControlsProps) {
    const {
        isAlignMode,
        isAblateMode,
        isConnectMode,
        toggleAlignMode,
        toggleAblateMode,
        toggleConnectMode,
        tokenizeBoth,
        clearSelections,
        sourceText,
        destText,
    } = usePatch();

    const canTokenize = sourceText.trim().length > 0 && destText.trim().length > 0;

    return (
        <div className="flex items-center gap-2">
            <Button
                variant={isAlignMode ? "default" : "outline"}
                size="sm"
                onClick={toggleAlignMode}
                disabled={isConnectMode}
                title="Align mode"
            >
                <GitCompareArrows className="w-4 h-4 mr-1" /> Align
            </Button>
            <Button
                variant={isAblateMode ? "default" : "outline"}
                size="sm"
                onClick={toggleAblateMode}
                title="Ablation mode"
            >
                <Scissors className="w-4 h-4 mr-1" /> Ablate
            </Button>
            <Button
                variant={isConnectMode ? "default" : "outline"}
                size="sm"
                onClick={toggleConnectMode}
                disabled={isAlignMode}
                title="Connect mode"
            >
                <LinkIcon className="w-4 h-4 mr-1" /> Connect
            </Button>
            <div className="ml-2" />
            <Button
                variant="outline"
                size="sm"
                onClick={tokenizeBoth}
                disabled={!canTokenize}
                title="Tokenize both prompts"
            >
                <Route className="w-4 h-4 mr-1" /> Tokenize
            </Button>
            <Button
                variant="outline"
                size="sm"
                onClick={clearSelections}
                title="Clear selections"
            >
                Clear
            </Button>
            <div className="ml-auto" />
            <Button
                variant="outline"
                size="icon"
                onClick={() => setIsEditing(!isEditing)}
                title="Toggle edit mode"
            >
                <Pencil className="w-4 h-4" />
            </Button>
        </div>
    )
}