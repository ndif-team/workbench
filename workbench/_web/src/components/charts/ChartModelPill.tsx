import { cn } from "@/lib/utils";

interface ChartModelPillProps {
    /** Full model name (e.g. "meta-llama/Llama-3.1-405B-Instruct"). The org
     * prefix is stripped for display; the full id stays in the aria-label
     * and `title`. */
    modelName: string;
    className?: string;
}

const stripOrg = (name: string): string => {
    const slash = name.lastIndexOf("/");
    return slash === -1 ? name : name.slice(slash + 1);
};

/**
 * Outlined "stale model" pill — sits next to the chart title when the
 * workspace's selected model differs from the model that produced the
 * rendered visualization. Existence of the pill IS the signal; outline-only
 * treatment communicates "metadata, not action".
 *
 * Callers decide whether to render the pill via the standard pattern:
 *
 *     {stale && chartModel && <ChartModelPill modelName={chartModel} />}
 *
 * where `stale` comes from `isChartStale(...)` in `configModelDiff.ts`.
 */
export function ChartModelPill({ modelName, className }: ChartModelPillProps) {
    const label = stripOrg(modelName);
    return (
        <span
            role="status"
            title={modelName}
            aria-label={`Chart computed with ${modelName}. Selector now references a different model.`}
            className={cn(
                "inline-flex items-center h-7 px-2.5 rounded-md",
                "bg-transparent",
                "border border-purple-700/50 dark:border-purple-400/40",
                "font-mono text-xs text-purple-700 dark:text-purple-400",
                "select-none",
                className,
            )}
        >
            {label}
        </span>
    );
}
