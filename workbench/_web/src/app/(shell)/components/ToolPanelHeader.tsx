import { BookOpen, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ToolPanelActionsProps {
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
    /** Optional className override for the Sync button. Logit lens omits it and
     * inherits the primary blue; AP passes a violet class to match its Run
     * button. */
    syncClassName?: string;
    /** Draws Reset and Sync as bare icons, for a toolbar of icon buttons. */
    iconOnly?: boolean;
    onReset: () => void;
    onSync: () => void;
}

interface ToolPanelHeaderProps extends ToolPanelActionsProps {
    /** Panel title (e.g. "Logit Lens", "Activation Patching"). */
    title: string;
    /** Optional reference link (e.g. the tool's paper) shown as a small book
     * icon next to the title. */
    reference?: { href: string; label: string };
}

/**
 * A tool's draft-state actions, in priority order: ⚠ View Mode → Reset → Sync.
 * Each is gated on its own visibility prop, so this renders nothing when none
 * applies. Shared by the panel header and the phone's floating composer.
 */
export function ToolPanelActions({
    viewMode,
    showReset,
    showSync,
    isExecuting,
    syncClassName,
    iconOnly = false,
    onReset,
    onSync,
}: ToolPanelActionsProps) {
    return (
        <>
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
            {showReset && iconOnly && (
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={onReset}
                    disabled={isExecuting}
                    aria-label="Discard changes"
                    title="Discard changes"
                >
                    <RotateCcw className="text-muted-foreground" />
                </Button>
            )}
            {showReset && !iconOnly && (
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
            {showSync && iconOnly && (
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={onSync}
                    disabled={isExecuting}
                    aria-label="Update saved config to selected model"
                    title="Use the selected model"
                >
                    <RefreshCw className="text-muted-foreground" />
                </Button>
            )}
            {showSync && !iconOnly && (
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
        </>
    );
}

/**
 * Shared title row used by every interpretability tool's Controls component:
 * the title, then the tool's draft-state actions (`ToolPanelActions`),
 * right-aligned. Only the title is permanent.
 */
export function ToolPanelHeader({ title, reference, ...actions }: ToolPanelHeaderProps) {
    return (
        <div className="p-3 border-b flex items-center justify-between">
            <div className="flex items-center gap-1.5 pl-2">
                <h2 className="text-sm font-medium">{title}</h2>
                {reference && (
                    <a
                        href={reference.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={reference.label}
                        title={reference.label}
                        className="text-muted-foreground/50 transition-colors hover:text-foreground"
                    >
                        <BookOpen className="h-3.5 w-3.5" />
                    </a>
                )}
            </div>
            <div className="flex items-center gap-1.5">
                <ToolPanelActions {...actions} />
            </div>
        </div>
    );
}
