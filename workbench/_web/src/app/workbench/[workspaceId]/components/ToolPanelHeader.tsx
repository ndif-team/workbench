import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ToolPanelHeaderProps {
    /** Panel title (e.g. "Logit Lens", "Activation Patching"). */
    title: string;
    /** True when models are unavailable AND not currently fetching — shows
     * the compact ⚠ View Mode indicator. */
    viewMode: boolean;
    /** True when the draft has diverged from the saved config and the chart
     * already has data — shows the Reset button. */
    showReset: boolean;
    /** True when the workspace's selected model differs from the draft —
     * shows the Sync button. */
    showSync: boolean;
    /** Disables both action buttons while a mutation is in flight. */
    isExecuting: boolean;
    /** Optional className override for the Sync button. Lens2 omits it and
     * inherits the primary blue; AP passes a violet class to match its Run
     * button. */
    syncClassName?: string;
    onReset: () => void;
    onSync: () => void;
}

/**
 * Shared title row used by every interpretability tool's Controls component.
 *
 * Right-aligned, in priority order: ⚠ View Mode → Reset → Sync. Each element
 * is gated on its own visibility prop; only the title is permanent.
 */
export function ToolPanelHeader({
    title,
    viewMode,
    showReset,
    showSync,
    isExecuting,
    syncClassName,
    onReset,
    onSync,
}: ToolPanelHeaderProps) {
    return (
        <div className="p-3 border-b flex items-center justify-between">
            <h2 className="text-sm pl-2 font-medium">{title}</h2>
            <div className="flex items-center gap-1.5">
                {viewMode && (
                    <span
                        role="status"
                        aria-label="View only — models unavailable"
                        className={cn(
                            "inline-flex items-center gap-1 h-6 px-2 rounded-md select-none",
                            "border border-yellow-500/50",
                            "text-xs font-medium text-yellow-700 dark:text-yellow-400",
                        )}
                    >
                        <span aria-hidden>⚠</span>
                        View Mode
                    </span>
                )}
                {showReset && (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={onReset}
                        disabled={isExecuting}
                        aria-label="Discard changes"
                        className="h-6 px-2 text-xs gap-1"
                    >
                        <RotateCcw />
                        Reset
                    </Button>
                )}
                {showSync && (
                    <Button
                        type="button"
                        size="sm"
                        onClick={onSync}
                        disabled={isExecuting}
                        aria-label="Update saved config to selected model"
                        className={cn("h-6 px-2.5 text-xs", syncClassName)}
                    >
                        Sync
                    </Button>
                )}
            </div>
        </div>
    );
}
