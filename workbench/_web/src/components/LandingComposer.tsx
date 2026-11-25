"use client";

import { useState, useRef, useEffect, type ElementRef, type ReactNode } from "react";
import { RunButton } from "@/components/RunButton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight, ChevronDown, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { getUserWorkspaces } from "@/lib/queries/workspaceQueries";
import { newChartPath } from "@/lib/chartRoutes";
import { ChartOrigins, launchTool, type ChartOrigin } from "@/lib/chartLaunch";
import { useCapture } from "@/lib/analytics";
import { useLaunchChart } from "@/hooks/useLaunchChart";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ModelPopover } from "@/components/model-selector/ModelPopover";
import {
    defaultModel,
    deriveHeat,
    isModelCold,
    MODEL_STATUS,
    splitRepo,
} from "@/components/model-selector/status";
import {
    LAUNCH_TRIGGER_QUIET,
    ToolPill,
    WorkspacePill,
} from "@/components/selectors/LaunchSelectors";
import { PROMPT_FIELD } from "@/components/promptField";
import { cn } from "@/lib/utils";
import PromptVisualization from "@/components/PromptVisualization";
import { CwLogoMark } from "@/components/CwLogo";
import { LoopBadge } from "@/components/LoopBadge";
import { LoopMark } from "@/components/LoopMark";
import { FeaturedLaunch } from "@/lib/featuredLaunch";
import { useModelDeployment } from "@/stores/useModelDeployment";
import type { Model, Token } from "@/types/models";
import type { SourcePosition } from "@/types/activationPatching";
import type { ToolType } from "@/types/charts";
import { ActivationPatchingLandingInput } from "@/components/ActivationPatchingLandingInput";
import {
    isToolSupportedForModel,
    unsupportedReasonFor,
    toolTypeFromDisplay,
} from "@/lib/toolSupport";

type CurrentUser = SupabaseUser & { is_anonymous?: boolean | null };

function ModelPillOrSelect({
    modelsLoading,
    modelsError,
    hasModels,
    modelsToSelect,
    selectedModel,
    onModelChange,
    disabled,
    loggedIn,
    toolType,
}: {
    modelsLoading: boolean;
    modelsError: boolean;
    hasModels: boolean;
    modelsToSelect: Model[];
    selectedModel: string;
    onModelChange: (value: string) => void;
    disabled: boolean;
    loggedIn: boolean;
    /** The selected tool (if it restricts models); models it can't run are
     * shown disabled with a reason. Null → no restriction. */
    toolType: ToolType | null;
}) {
    if (modelsLoading) {
        return (
            <Button
                type="button"
                variant="ghost"
                size="control"
                disabled
                aria-label="Select model"
                className="min-w-12 shrink"
            >
                <Loader2 className="animate-spin text-muted-foreground" />
                <span className="truncate">Loading models</span>
            </Button>
        );
    }

    if (modelsError || !hasModels) {
        return (
            <Button
                type="button"
                variant="ghost"
                size="control"
                disabled
                aria-label="Select model"
                className="min-w-12 shrink text-destructive"
            >
                <span className="truncate">Models unavailable</span>
            </Button>
        );
    }

    // Landing-page policy: surface every hot model (ready-to-run on NDIF
    // right now), including gated ones — those render with a purple gated
    // dot (via deriveHeat → "gated" for an anonymous visitor) so users see
    // they need to sign in rather than having them silently hidden.
    // Warm/cold models stay behind the "N more models" footer link.
    const hotModels = modelsToSelect.filter((m) => m.status === "hot");
    const moreCount = modelsToSelect.length - hotModels.length;

    return (
        <ModelTriggerPopover
            models={hotModels}
            moreCount={moreCount}
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            disabled={disabled}
            loggedIn={loggedIn}
            toolType={toolType}
        />
    );
}

/**
 * Landing-page model picker: an outline button with the model's status dot
 * and name, opening the same Base/Chat/heat-sorted Popover used in the
 * workspace `ModelControl`. Single source of truth for the picker UI.
 */
function ModelTriggerPopover({
    models,
    moreCount,
    selectedModel,
    onModelChange,
    disabled,
    loggedIn,
    toolType,
}: {
    models: Model[];
    moreCount: number;
    selectedModel: string;
    onModelChange: (value: string) => void;
    disabled: boolean;
    loggedIn: boolean;
    toolType: ToolType | null;
}) {
    const [open, setOpen] = useState(false);
    const [alignOffset, setAlignOffset] = useState(0);
    const triggerRef = useRef<HTMLButtonElement>(null);

    const model = models.find((m) => m.name === selectedModel);

    return (
        <Popover
            open={open}
            onOpenChange={(next) => {
                if (next) setAlignOffset(ModelPopover.alignOffsetFor(triggerRef.current));
                setOpen(next);
            }}
        >
            <PopoverTrigger asChild>
                <button
                    ref={triggerRef}
                    type="button"
                    disabled={disabled}
                    className={cn(LAUNCH_TRIGGER_QUIET, "min-w-20")}
                    aria-label="Select model"
                    title={selectedModel || undefined}
                >
                    {model && (
                        <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-full"
                            style={{ backgroundColor: MODEL_STATUS[deriveHeat(model)].color }}
                        />
                    )}
                    <span className="truncate font-mono text-xs">
                        {selectedModel ? splitRepo(selectedModel).label : "Select model"}
                    </span>
                    <ChevronDown className="size-3 opacity-50 shrink-0" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                side="bottom"
                // Never flip up — the menu caps to the room below (the shell
                // reads --radix-popover-content-available-height) and scrolls.
                // This also disables horizontal shift, so `alignOffset` keeps
                // the menu on a phone's screen.
                avoidCollisions={false}
                alignOffset={alignOffset}
                collisionPadding={8}
                sideOffset={6}
                style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
                className="p-0 border-0 bg-transparent shadow-none w-auto"
                onCloseAutoFocus={(e) => e.preventDefault()}
            >
                <ModelPopover
                    models={models}
                    selectedName={selectedModel}
                    onSelect={(name) => {
                        onModelChange(name);
                        setOpen(false);
                    }}
                    showSearch={false}
                    groupTabs
                    isModelDisabled={
                        toolType ? (m) => !isToolSupportedForModel(toolType, m) : undefined
                    }
                    disabledReason={
                        toolType ? (unsupportedReasonFor(toolType) ?? undefined) : undefined
                    }
                    footer={
                        moreCount > 0 ? (
                            <Link
                                href={loggedIn ? "/models" : "/login"}
                                className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors group"
                            >
                                <span>
                                    <span className="text-foreground font-medium tabular-nums">
                                        {moreCount}
                                    </span>{" "}
                                    more model{moreCount === 1 ? "" : "s"}
                                    {!loggedIn && (
                                        <span className="text-muted-foreground/70">
                                            {" "}
                                            — sign in to use
                                        </span>
                                    )}
                                </span>
                                <ArrowRight className="size-3 opacity-60 group-hover:translate-x-0.5 transition-transform" />
                            </Link>
                        ) : null
                    }
                />
            </PopoverContent>
        </Popover>
    );
}

/**
 * The landing page's hero and chart composer: a prompt, the tool, model and
 * (for a signed-in user with folders) workspace pickers, and Run, which
 * launches the chart (`useLaunchChart`). A visitor who isn't signed in passes a
 * captcha and is signed in anonymously first; a gated model sends them to
 * sign in. The app's Home page renders the same component; `loggedIn` (a
 * session) tells the two apart in analytics, as `surface`.
 *
 * Above the hero's title, one line invites the visitor to try what is
 * featured (`FeaturedLaunch`) and launches it in a click.
 *
 * `landing_submission` and `featured_launch` are captured at intent, before
 * the captcha and sign-in gates, so the drop-off between asking for a chart
 * and reaching one is visible; `chart_created` follows once it exists. The
 * featured chart is empty and never runs by itself, so its event may be the
 * only record that it was asked for.
 */
export function LandingComposer({ loggedIn }: { loggedIn: boolean }) {
    const [prompt, setPrompt] = useState("");
    const [showCaptcha, setShowCaptcha] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedModel, setSelectedModel] = useState<string>("");
    const [selectedTool, setSelectedTool] = useState<string>("Logit Lens");
    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
    const captchaRef = useRef<ElementRef<typeof HCaptcha> | null>(null);
    const promptRef = useRef<HTMLTextAreaElement>(null);

    // The lens prompt rests at one line and grows with its text.
    useEffect(() => {
        const el = promptRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
    }, [prompt, selectedTool]);
    // A prebuilt `/new?…` query to redirect to after anonymous sign-in.
    // Set by the one-click launches (the featured one) that don't go through
    // the prompt form; null → fall back to building params from the form state.
    const pendingLaunchRef = useRef<{ query: string; origin: ChartOrigin } | null>(null);
    const router = useRouter();
    const launchChart = useLaunchChart();
    const startDeployment = useModelDeployment((s) => s.start);
    const capture = useCapture();
    const surface = loggedIn ? "home" : "landing";

    // Activation patching state
    const [srcPrompt, setSrcPrompt] = useState("");
    const [tgtPrompt, setTgtPrompt] = useState("");
    const [srcTokens, setSrcTokens] = useState<Token[]>([]);
    const [tgtTokens, setTgtTokens] = useState<Token[]>([]);
    const [srcPos, setSrcPos] = useState<SourcePosition[]>([]);
    const [tgtPos, setTgtPos] = useState<number[]>([]);
    const [tgtFreeze, setTgtFreeze] = useState<number[]>([]);
    const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");

    useEffect(() => {
        const fetchUser = async () => {
            if (loggedIn) {
                const supabase = createClient();
                const {
                    data: { user },
                } = await supabase.auth.getUser();
                setCurrentUser(user);
            }
        };

        fetchUser();
    }, [loggedIn]);

    const isSignedInUser = loggedIn && currentUser && !currentUser.is_anonymous;

    const { data: workspacesList } = useQuery({
        queryKey: ["workspaces", currentUser?.id],
        queryFn: () => getUserWorkspaces(),
        enabled: !!isSignedInUser,
    });

    const { data: models, isLoading: modelsLoading, isError: modelsError } = useModelsQuery();
    const modelsToSelect: Model[] = models && models.length > 0 ? models : [];
    const hasModels = modelsToSelect.length > 0;

    // Default to the model a blank chart starts on when models load
    // (`defaultModel`: a hot one the current user can run, skipping gated
    // models a guest can't use).
    useEffect(() => {
        if (
            models &&
            models.length > 0 &&
            (!selectedModel || !models.some((m) => m.name === selectedModel))
        ) {
            const model = defaultModel(models);
            if (model) setSelectedModel(model.name);
        }
    }, [models, selectedModel]);

    const handleCaptchaVerify = async (token: string) => {
        const supabase = createClient();
        setIsSubmitting(true);

        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.auth as any).signInAnonymously({
                options: { captchaToken: token },
            });

            if (error) {
                console.error("Anonymous sign-in error:", error);
                setShowCaptcha(false);
                captchaRef.current?.resetCaptcha();
                setIsSubmitting(false);
                pendingLaunchRef.current = null;
            } else {
                // A one-click launch (the featured one) prebuilt its target;
                // otherwise build from the prompt-form state.
                let qs = pendingLaunchRef.current?.query;
                const origin = pendingLaunchRef.current?.origin ?? surface;
                if (!qs) {
                    const params = new URLSearchParams({
                        model: selectedModel,
                        tool: selectedTool,
                    });

                    if (selectedTool === "Activation Patching") {
                        params.set("srcPrompt", srcPrompt);
                        params.set("tgtPrompt", tgtPrompt);
                        params.set("srcPos", JSON.stringify(srcPos));
                        params.set("tgtPos", JSON.stringify(tgtPos));
                        if (tgtFreeze.length > 0) {
                            params.set("tgtFreeze", JSON.stringify(tgtFreeze));
                        }
                    } else {
                        params.set("prompt", prompt);
                    }

                    if (selectedWorkspace) {
                        params.set("workspaceId", selectedWorkspace);
                    }
                    qs = params.toString();
                }
                pendingLaunchRef.current = null;
                window.location.href = ChartOrigins.tag(newChartPath(qs), origin);
            }
        } catch (err) {
            console.error("Anonymous sign-in error:", err);
            setShowCaptcha(false);
            captchaRef.current?.resetCaptcha();
            setIsSubmitting(false);
            pendingLaunchRef.current = null;
        }
    };

    // Check if the selected model is gated
    const isSelectedModelGated = (): boolean => {
        const model = modelsToSelect.find((m) => m.name === selectedModel);
        return model?.gated === true && model?.allowed === false;
    };

    // The launch's own selection, as the composer's events report it.
    const launchProperties = (model: Model | undefined) => ({
        surface,
        signed_in: !!isSignedInUser,
        model: model?.name,
        model_heat: model?.status,
        gated: model?.gated === true && model?.allowed === false,
        workspace: selectedWorkspace ? "folder" : "default",
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validate based on tool type
        if (selectedTool === "Activation Patching") {
            if (
                !srcPrompt.trim() ||
                !tgtPrompt.trim() ||
                srcPos.length === 0 ||
                srcPos.length !== tgtPos.length
            ) {
                return;
            }
        } else {
            if (!prompt.trim()) return;
        }

        const patching = selectedTool === "Activation Patching";
        const submitted = patching ? srcPrompt : prompt;
        capture("landing_submission", {
            ...launchProperties(modelsToSelect.find((m) => m.name === selectedModel)),
            tool: launchTool(selectedTool),
            prompt: submitted,
            prompt_length: submitted.length,
            ...(patching && {
                target_prompt: tgtPrompt,
                target_prompt_length: tgtPrompt.length,
            }),
        });

        // Check if user is trying to use a gated model without being logged in
        if (isSelectedModelGated() && (!loggedIn || !currentUser || currentUser.is_anonymous)) {
            // Redirect to login with the full tool context so the request can resume post-auth
            const params = new URLSearchParams({
                model: selectedModel,
                tool: selectedTool,
                gatedModel: "true",
            });
            if (selectedTool === "Activation Patching") {
                params.set("srcPrompt", srcPrompt);
                params.set("tgtPrompt", tgtPrompt);
                params.set("srcPos", JSON.stringify(srcPos));
                params.set("tgtPos", JSON.stringify(tgtPos));
                if (tgtFreeze.length > 0) {
                    params.set("tgtFreeze", JSON.stringify(tgtFreeze));
                }
            } else {
                params.set("prompt", prompt);
            }
            router.push(`/login?${params.toString()}`);
            return;
        }

        // Build params based on tool type
        const params = new URLSearchParams({
            model: selectedModel,
            tool: selectedTool,
        });

        if (selectedWorkspace) {
            params.set("workspaceId", selectedWorkspace);
        }

        if (selectedTool === "Activation Patching") {
            params.set("srcPrompt", srcPrompt);
            params.set("tgtPrompt", tgtPrompt);
            params.set("srcPos", JSON.stringify(srcPos));
            params.set("tgtPos", JSON.stringify(tgtPos));
            if (tgtFreeze.length > 0) {
                params.set("tgtFreeze", JSON.stringify(tgtFreeze));
            }
        } else {
            params.set("prompt", prompt);
        }

        // If user is logged in (not anonymous), create the chart directly
        if (loggedIn && currentUser && !currentUser.is_anonymous) {
            launchChart(params, surface);
        } else {
            // Show captcha for anonymous/non-logged-in users
            setShowCaptcha(true);
        }
    };

    // The featured model as the catalog lists it; the hero's line shows only
    // once it does, since a model NDIF does not serve cannot be launched.
    const featuredModel = modelsToSelect.find((m) => m.name === FeaturedLaunch.MODEL);

    // One-click launch of the featured chart (`FeaturedLaunch`): its tool on
    // its model, with its options picked. A visitor the model is gated for
    // signs in first and the launch resumes after; a signed-in user's launch
    // starts deploying a model that is cold, so the chart opens on its
    // deploying state; anyone else passes the captcha and is signed in
    // anonymously first.
    const handleFeaturedLaunch = () => {
        if (!featuredModel) return;

        // Reflect the choice in the composer either way.
        setSelectedTool(FeaturedLaunch.TOOL);
        setSelectedModel(featuredModel.name);

        capture("featured_launch", {
            ...launchProperties(featuredModel),
            tool: launchTool(FeaturedLaunch.TOOL),
            feature: FeaturedLaunch.ID,
        });

        const params = FeaturedLaunch.params(selectedWorkspace || undefined);
        const signedIn = loggedIn && !!currentUser && !currentUser.is_anonymous;
        const gated = featuredModel.gated === true && featuredModel.allowed === false;

        if (gated && !signedIn) {
            params.delete("workspaceId");
            params.set("gatedModel", "true");
            router.push(`/login?${params.toString()}`);
        } else if (signedIn) {
            if (isModelCold(featuredModel)) startDeployment(featuredModel.name);
            launchChart(params, "featured_launch");
        } else {
            pendingLaunchRef.current = { query: params.toString(), origin: "featured_launch" };
            setShowCaptcha(true);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && prompt.trim()) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const box = cn(
        "rounded-md border bg-card shadow-lg transition-[border-color,box-shadow] dark:bg-secondary",
        PROMPT_FIELD.composer,
    );

    // Under the composer's box: what the run is of (tool, model) and where it
    // lands (workspace).
    const pickers = (
        <div className="flex items-center gap-0.5 px-1.5">
            <ToolPill
                value={selectedTool}
                onChange={setSelectedTool}
                disabled={showCaptcha || isSubmitting}
                triggerClassName={cn(LAUNCH_TRIGGER_QUIET, "shrink-0")}
            />
            <ModelPillOrSelect
                modelsLoading={modelsLoading}
                modelsError={modelsError}
                hasModels={hasModels}
                modelsToSelect={modelsToSelect}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                disabled={showCaptcha || isSubmitting}
                loggedIn={loggedIn}
                toolType={toolTypeFromDisplay(selectedTool)}
            />
            {isSignedInUser && workspacesList && workspacesList.length > 0 && (
                <WorkspacePill
                    value={selectedWorkspace}
                    onChange={setSelectedWorkspace}
                    disabled={showCaptcha || isSubmitting}
                    workspaces={workspacesList}
                    triggerClassName={LAUNCH_TRIGGER_QUIET}
                    quietDefault
                />
            )}
        </div>
    );

    // The box's last row: a tool's own controls and its hint for the next
    // step (activation patching's), then Run.
    const toolbar = (tools?: ReactNode, hint = "") => (
        <div
            className={cn(
                "flex items-center gap-1.5 p-2",
                selectedTool !== "Activation Patching" && "p-2.5 md:p-3",
            )}
        >
            {tools && <div className="flex shrink-0 items-center">{tools}</div>}
            {tools && (
                <span
                    aria-live="polite"
                    className="min-w-0 flex-1 text-balance px-1 text-right text-xs text-muted-foreground"
                >
                    {hint}
                </span>
            )}
            <RunButton
                type="submit"
                aria-label="Run"
                busy={isSubmitting}
                disabled={
                    showCaptcha ||
                    isSubmitting ||
                    !hasModels ||
                    (selectedTool === "Activation Patching"
                        ? !srcPrompt.trim() ||
                          !tgtPrompt.trim() ||
                          srcPos.length === 0 ||
                          srcPos.length !== tgtPos.length
                        : !prompt.trim())
                }
            />
        </div>
    );

    return (
        // Fills its page's height and sits above center: of the room left,
        // one part goes above the hero and five below the composer.
        <div className="max-w-4xl monitor:max-w-5xl wide:max-w-6xl mx-auto w-full flex flex-1 flex-col pb-8">
            <div aria-hidden className="flex-1" />
            {/* Hero Section */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-center space-y-4 mb-8 md:mb-12"
            >
                {/* What is featured: the looped Inkling, launched in a click.
                    The line keeps its room while the catalog loads, and
                    stays out when the catalog does not list the model. On a
                    phone it breaks before the model's name. */}
                <div className="flex min-h-7 items-center justify-center">
                    {featuredModel && (
                        <button
                            type="button"
                            onClick={handleFeaturedLaunch}
                            disabled={showCaptcha || isSubmitting}
                            className="inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
                        >
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                <LoopBadge
                                    text="NEW"
                                    label="New"
                                    className="h-7 w-11 shrink-0 -rotate-12"
                                />
                                Explore Looped Transformer model
                            </span>
                            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                <span className="font-semibold text-foreground">
                                    Inkling 2 Mini
                                </span>
                                <LoopMark className="h-4 w-8 shrink-0" />
                            </span>
                        </button>
                    )}
                </div>

                <h1 className="flex items-center justify-center gap-3 text-5xl lg:gap-4 lg:text-7xl monitor:gap-5 monitor:text-8xl wide:gap-6 wide:text-9xl font-bold tracking-tight pt-2">
                    {/* <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text text-transparent">
                        Explore the Inner
                    </span>
                    <br /> */}
                    <span className="lg:hidden">
                        <CwLogoMark cell={10} />
                    </span>
                    <span className="hidden lg:block monitor:hidden">
                        <CwLogoMark cell={15} />
                    </span>
                    <span className="hidden monitor:block wide:hidden">
                        <CwLogoMark cell={20} />
                    </span>
                    <span className="hidden wide:block">
                        <CwLogoMark cell={26} />
                    </span>
                    <span className="bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-transparent">
                        workbench
                    </span>
                </h1>

                <p className="text-base sm:text-lg md:text-xl monitor:text-2xl wide:text-3xl text-muted-foreground max-w-2xl monitor:max-w-3xl wide:max-w-5xl mx-auto leading-relaxed pt-0">
                    Explore LLM internals and build your experiments interactively.
                </p>

                {/* <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed pt-2">
                    Dive deep into neural network activations, visualize attention patterns,
                    and understand what happens inside large language models.
                </p> */}
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
            >
                <PromptVisualization />
            </motion.div>

            {/* Composer: a box of the prompt over Run, then the pickers under it */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.4 }}
                // Narrower than the hero's column. On a phone the example above
                // wraps, and its prediction's probability hangs below it.
                className="mx-auto w-full max-w-3xl monitor:max-w-4xl wide:max-w-5xl pt-8 max-sm:pt-10"
            >
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                    {selectedTool !== "Activation Patching" ? (
                        <div className={cn(box, "flex items-end")}>
                            <Textarea
                                ref={promptRef}
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Enter a prompt to analyze..."
                                aria-label="Prompt"
                                rows={1}
                                className="prompt-input custom-scrollbar max-h-44 min-h-20 flex-1 resize-none border-0 bg-transparent py-3 pl-4 pr-0 text-base leading-7 shadow-none focus-visible:ring-0 dark:bg-transparent md:text-base md:leading-7 monitor:max-h-52 monitor:text-lg monitor:leading-7 wide:max-h-60 wide:text-xl wide:leading-8"
                                disabled={showCaptcha || isSubmitting}
                            />
                            {toolbar()}
                        </div>
                    ) : (
                        <ActivationPatchingLandingInput
                            srcPrompt={srcPrompt}
                            setSrcPrompt={setSrcPrompt}
                            tgtPrompt={tgtPrompt}
                            setTgtPrompt={setTgtPrompt}
                            srcTokens={srcTokens}
                            setSrcTokens={setSrcTokens}
                            tgtTokens={tgtTokens}
                            setTgtTokens={setTgtTokens}
                            srcPos={srcPos}
                            setSrcPos={setSrcPos}
                            tgtPos={tgtPos}
                            setTgtPos={setTgtPos}
                            tgtFreeze={tgtFreeze}
                            setTgtFreeze={setTgtFreeze}
                            selectedModel={selectedModel}
                            disabled={showCaptcha || isSubmitting}
                            toolbar={toolbar}
                            box={box}
                        />
                    )}
                    {pickers}

                    {showCaptcha && (
                        <div className="flex flex-col items-center gap-2">
                            <HCaptcha
                                ref={captchaRef}
                                sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY as string}
                                onVerify={handleCaptchaVerify}
                            />
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setShowCaptcha(false);
                                    captchaRef.current?.resetCaptcha();
                                    pendingLaunchRef.current = null;
                                }}
                            >
                                Cancel
                            </Button>
                        </div>
                    )}
                </form>

                {(!loggedIn || currentUser?.is_anonymous) && (
                    <p className="mt-3 text-center text-xs text-muted-foreground">
                        Log in to access all our models and features.
                    </p>
                )}
            </motion.div>

            <div aria-hidden className="flex-[5]" />

            {/* Feature Pills */}
            {/* <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.6 }}
                className="flex flex-wrap justify-center gap-4"
            >
                {[
                    { icon: Brain, text: "Token Analysis" },
                    { icon: Zap, text: "Real-time Predictions" },
                    { icon: Sparkles, text: "Interactive Visualizations" },
                ].map((feature, index) => (
                    <div
                        key={index}
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/50 border border-border backdrop-blur-sm"
                    >
                        <feature.icon className="w-4 h-4 text-primary" />
                        <span className="text-sm text-muted-foreground">
                            {feature.text}
                        </span>
                    </div>
                ))}
            </motion.div> */}
        </div>
    );
}
