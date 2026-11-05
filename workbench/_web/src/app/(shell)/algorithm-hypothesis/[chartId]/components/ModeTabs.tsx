import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AlgorithmHypothesisMode } from "@/types/algorithmHypothesis";

const MODES: { mode: AlgorithmHypothesisMode; label: string }[] = [
    { mode: "edit", label: "Edit" },
    { mode: "intervene", label: "Intervene" },
    { mode: "sweep", label: "Sweep" },
];

/** Switch between building the algorithm and intervening on it. */
export function ModeTabs({
    mode,
    onModeChange,
    walkthroughOpen,
    onWalkthrough,
}: {
    mode: AlgorithmHypothesisMode;
    onModeChange: (mode: AlgorithmHypothesisMode) => void;
    walkthroughOpen?: boolean;
    /** Opens or closes the paper walkthrough. */
    onWalkthrough?: () => void;
}) {
    return (
        <div className="flex items-center gap-2">
            {onWalkthrough && (
                <Button
                    variant={walkthroughOpen ? "secondary" : "ghost"}
                    size="sm"
                    aria-pressed={!!walkthroughOpen}
                    onClick={onWalkthrough}
                    title="A guided walkthrough of the paper's example"
                >
                    <BookOpen />
                    Walkthrough
                </Button>
            )}
            <div
                className="flex items-center gap-0.5 rounded-md border p-0.5"
                role="group"
                aria-label="Mode"
            >
                {MODES.map((m) => (
                    <Button
                        key={m.mode}
                        size="sm"
                        variant={mode === m.mode ? "secondary" : "ghost"}
                        aria-pressed={mode === m.mode}
                        className="h-7 px-2.5"
                        onClick={() => onModeChange(m.mode)}
                    >
                        {m.label}
                    </Button>
                ))}
            </div>
        </div>
    );
}
