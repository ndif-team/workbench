"use client";

import { Cloud, Loader2, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { MODEL_STATUS } from "@/components/model-selector/status";
import { useModelDeployment } from "@/stores/useModelDeployment";
import type { DeploymentPhase } from "@/types/deployment";

interface ModelDeployingPanelProps {
    modelName: string;
    phase: DeploymentPhase;
}

const stripOrg = (name: string) => {
    const slash = name.lastIndexOf("/");
    return slash === -1 ? name : name.slice(slash + 1);
};

/**
 * Replaces a chart's controls + visualization while its model is being
 * deployed (warmed up on NDIF). One spinner, the model name + status, and
 * recoverable actions. Cold models that haven't started warming up yet show a
 * Deploy action; in-progress shows a spinner; failures show Retry.
 */
export function ModelDeployingPanel({ modelName, phase }: ModelDeployingPanelProps) {
    const start = useModelDeployment((s) => s.start);
    const retry = useModelDeployment((s) => s.retry);

    const inProgress = phase === "submitting" || phase === "deploying";
    const failed = phase === "error";
    const error = useModelDeployment((s) => s.deployments[modelName]?.error);

    const statusLabel = failed ? "Deployment failed" : inProgress ? "Deploying…" : "Not deployed";

    return (
        <div
            className="flex size-full items-center justify-center p-8"
            role="status"
            aria-live="polite"
        >
            <div className="flex w-full max-w-lg flex-col items-center gap-6 text-center">
                <span className="inline-flex h-16 w-16 items-center justify-center rounded-md border bg-secondary/60">
                    {inProgress ? (
                        <Loader2
                            className="h-8 w-8 animate-spin"
                            style={{ color: MODEL_STATUS.deploying.color }}
                        />
                    ) : (
                        <Cloud className="h-8 w-8 text-muted-foreground" />
                    )}
                </span>

                <div className="flex flex-col gap-2">
                    <h2 className="text-xl font-semibold">{statusLabel}</h2>
                    <p className="font-mono text-sm text-muted-foreground break-all">
                        {stripOrg(modelName)}
                    </p>
                </div>

                <p className="max-w-md text-base leading-relaxed text-muted-foreground">
                    {inProgress
                        ? "Deploying this model may take a few minutes — you can leave this page and come back; the chart will load once the model is ready."
                        : failed
                          ? (error ?? "The model couldn't be deployed.")
                          : "This model isn't currently deployed. Deploy it to run this chart."}
                </p>

                {!inProgress &&
                    (failed ? (
                        <Button type="button" onClick={() => retry(modelName)} className="gap-1.5">
                            <RotateCcw className="h-4 w-4" />
                            Retry
                        </Button>
                    ) : (
                        <Button type="button" onClick={() => start(modelName)} className="gap-1.5">
                            <Cloud className="h-4 w-4" />
                            Deploy
                        </Button>
                    ))}
            </div>
        </div>
    );
}
