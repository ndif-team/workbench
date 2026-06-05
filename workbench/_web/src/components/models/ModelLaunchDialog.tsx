"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { Cloud, TriangleAlert } from "lucide-react";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { getWorkspaces } from "@/lib/queries/workspaceQueries";
import { useModelDeployment } from "@/stores/useModelDeployment";
import {
    ToolPill,
    WorkspacePill,
    NEUTRAL_PILL_TRIGGER,
} from "@/components/selectors/LaunchSelectors";
import type { ModelCardModel } from "./ModelCard";

const AUTH_DISABLED = process.env.NEXT_PUBLIC_DISABLE_AUTH === "true";

type CurrentUser = User & { is_anonymous?: boolean | null };

/** "deploy" — model is cold, warm it up first; "launch" — model is already
 * deployed, just open a chart (no backend warmup). */
export type ModelLaunchMode = "deploy" | "launch";

interface ModelLaunchDialogProps {
    /** The target model. Dialog is open while non-null. */
    model: ModelCardModel | null;
    mode: ModelLaunchMode;
    onOpenChange: (open: boolean) => void;
}

/**
 * Tool + workspace picker that opens a chart for a model. In "deploy" mode the
 * model is cold, so it kicks off the backend warmup first and the chart shows
 * the deploying state until it's hot. In "launch" mode the model is already
 * deployed, so it skips the warmup entirely and the chart opens ready to run.
 * Both create an empty chart (no prompt) of the chosen tool.
 */
export function ModelLaunchDialog({ model, mode, onOpenChange }: ModelLaunchDialogProps) {
    const router = useRouter();
    const startDeployment = useModelDeployment((s) => s.start);

    const [user, setUser] = useState<CurrentUser | null>(null);
    const [tool, setTool] = useState("Logit Lens");
    const [workspace, setWorkspace] = useState("new");

    const open = model !== null;
    const isDeploy = mode === "deploy";

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        createClient()
            .auth.getUser()
            .then(({ data }) => {
                if (!cancelled) setUser(data.user as CurrentUser | null);
            });
        return () => {
            cancelled = true;
        };
    }, [open]);

    const isSignedIn = AUTH_DISABLED || (!!user && !user.is_anonymous);

    const { data: workspaces } = useQuery({
        queryKey: ["workspaces", user?.id],
        queryFn: () => getWorkspaces(user!.id),
        enabled: open && isSignedIn && !!user?.id,
    });

    const goSignIn = () => {
        onOpenChange(false);
        router.push("/login");
    };

    const handleSubmit = () => {
        if (!model) return;
        if (!isSignedIn) {
            goSignIn();
            return;
        }

        // ModelCardModel.name is the org-stripped label; the backend catalog
        // is keyed by the full repo id, so reconstruct it for the request.
        const fullModelName = model.org ? `${model.org}/${model.name}` : model.name;

        // Deploy mode only: begin the warmup now so it survives navigation (the
        // store polls independently of the route). The chart's deploying panel
        // reads it. Launch mode skips this — the model is already hot.
        if (isDeploy) startDeployment(fullModelName);

        // Create an EMPTY chart (no dummy prompt) of the chosen tool, so the
        // user lands on either the deploying panel (cold) or ready controls
        // (already deployed) without anything being auto-run for them.
        const params = new URLSearchParams({
            model: fullModelName,
            tool,
            deploy: "true",
        });
        if (workspace && workspace !== "new") params.set("workspaceId", workspace);
        else params.set("createNew", "true");

        onOpenChange(false);
        router.push(`/workbench?${params.toString()}`);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>
                        Explore {model ? model.name : "model"}
                    </DialogTitle>
                    {isDeploy ? (
                        <DialogDescription className="flex items-start gap-2 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-200">
                            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                            <span>
                                This model isn&apos;t currently deployed. Deploying loads
                                it onto the backend if capacity allows, which can take a
                                few minutes. The chart is created once the model is HOT.
                            </span>
                        </DialogDescription>
                    ) : (
                        <DialogDescription>
                            Create a chart with this model. Pick a tool and a workspace to
                            open it in.
                        </DialogDescription>
                    )}
                </DialogHeader>

                {isSignedIn ? (
                    <div className="flex flex-col gap-3 py-1">
                        <div className="flex items-center gap-3">
                            <span className="w-20 shrink-0 text-sm text-muted-foreground">
                                Tool
                            </span>
                            <ToolPill
                                value={tool}
                                onChange={setTool}
                                disabled={false}
                                triggerClassName={NEUTRAL_PILL_TRIGGER}
                                compact={false}
                                modal
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="w-20 shrink-0 text-sm text-muted-foreground">
                                Workspace
                            </span>
                            <WorkspacePill
                                value={workspace}
                                onChange={setWorkspace}
                                disabled={false}
                                workspaces={workspaces ?? []}
                                triggerClassName={NEUTRAL_PILL_TRIGGER}
                                compact={false}
                                modal
                            />
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground py-1">
                        {isDeploy
                            ? "Sign in to deploy models. Deployment runs on shared backend resources and is only available to signed-in users."
                            : "Sign in to open a chart with this model."}
                    </p>
                )}

                <DialogFooter>
                    {isSignedIn ? (
                        <Button type="button" onClick={handleSubmit}>
                            {isDeploy && <Cloud className="h-4 w-4" />}
                            {isDeploy ? "Deploy + New Chart" : "New"}
                        </Button>
                    ) : (
                        <Button type="button" onClick={goSignIn}>
                            {isDeploy ? "Sign in to deploy" : "Sign in to continue"}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
