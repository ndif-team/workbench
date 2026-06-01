"use client";

import { useState, useRef, useEffect, type ElementRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { ArrowRight, Sparkles, Layers, Plus, ChevronDown } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { UserDropdown } from "@/components/UserDropdown";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useModelsQuery } from "@/lib/api/modelsApi";
import { queryKeys } from "@/lib/queryKeys";
import { getWorkspaces } from "@/lib/queries/workspaceQueries";

type WorkspaceListItem = Awaited<ReturnType<typeof getWorkspaces>>[number];
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
    SelectSeparator,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ModelPopover } from "@/components/model-selector/ModelPopover";
import { cn } from "@/lib/utils";
import PromptVisualization from "@/components/PromptVisualization";
import type { Model, Token } from "@/types/models";
import type { SourcePosition } from "@/types/activationPatching";
import { ActivationPatchingLandingInput } from "@/components/ActivationPatchingLandingInput";

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
}: {
    modelsLoading: boolean;
    modelsError: boolean;
    hasModels: boolean;
    modelsToSelect: Model[];
    selectedModel: string;
    onModelChange: (value: string) => void;
    disabled: boolean;
    loggedIn: boolean;
}) {
    const triggerClass = "h-5 w-fit text-[11px] bg-gradient-to-r from-primary/5 to-purple-500/5 border border-primary/10 hover:from-primary/10 hover:to-purple-500/10 hover:border-primary/20 transition-all gap-1 rounded-full focus:ring-0 focus:ring-offset-0 px-2";

    if (modelsLoading) {
        return (
            <div className="spinning-border-wrap">
                <div className="spinning-border-ring">
                    <div className="spinning-border-gradient" />
                </div>
                <div className="spinning-border-content" style={{ background: "linear-gradient(to right, hsl(var(--primary) / 0.05), rgb(168 85 247 / 0.05)), hsl(var(--card))" }}>
                    <Select disabled>
                        <SelectTrigger className={`${triggerClass} !border-0 !shadow-none [&_svg]:hidden`}>
                            <span>Fetching Models...</span>
                        </SelectTrigger>
                    </Select>
                </div>
            </div>
        );
    }

    if (modelsError || !hasModels) {
        return (
            <Select disabled>
                <SelectTrigger className={`${triggerClass} !from-red-500/10 !to-red-400/15 !border-red-500/25 text-destructive [&_svg]:hidden`}>
                    <span>Models Unavailable</span>
                </SelectTrigger>
            </Select>
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
            triggerClass={triggerClass}
            models={hotModels}
            moreCount={moreCount}
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            disabled={disabled}
            loggedIn={loggedIn}
        />
    );
}

/**
 * Landing-page model picker: keeps the existing tiny inline-pill trigger
 * but opens the same rich Base/Chat/heat-sorted/searchable Popover used in
 * the workspace `ModelControl`. Single source of truth for the picker UI.
 */
function ModelTriggerPopover({
    triggerClass,
    models,
    moreCount,
    selectedModel,
    onModelChange,
    disabled,
    loggedIn,
}: {
    triggerClass: string;
    models: Model[];
    moreCount: number;
    selectedModel: string;
    onModelChange: (value: string) => void;
    disabled: boolean;
    loggedIn: boolean;
}) {
    const [open, setOpen] = useState(false);

    const display = selectedModel || "Select model...";

    // Exact className + DOM that the current shadcn `SelectTrigger` renders.
    // Reproducing it verbatim (instead of going through `<Select>` + reading
    // the name out of registered SelectItems) lets us keep the same visual
    // pill without any Radix Select machinery getting in the way.
    const SELECT_TRIGGER_BASE =
        "border-input data-[placeholder]:text-muted-foreground [&_svg:not([class*='text-'])]:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive dark:bg-input/30 dark:hover:bg-input/50 flex w-fit items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[size=default]:h-8 data-[size=sm]:h-8 *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    disabled={disabled}
                    data-slot="select-trigger"
                    data-size="default"
                    className={cn(SELECT_TRIGGER_BASE, triggerClass)}
                    aria-label="Select model"
                >
                    <span data-slot="select-value">{display}</span>
                    <ChevronDown className="size-4 opacity-50" />
                </button>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                sideOffset={6}
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
                    compact
                    footer={
                        moreCount > 0 ? (
                            <Link
                                href={loggedIn ? "/workbench?models=open" : "/login"}
                                className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground transition-colors group"
                            >
                                <span>
                                    <span className="text-foreground font-medium tabular-nums">
                                        {moreCount}
                                    </span>{" "}
                                    more model{moreCount === 1 ? "" : "s"}
                                    {!loggedIn && (
                                        <span className="text-muted-foreground/70">
                                            {" "}— sign in to use
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

export function LandingPage({ loggedIn }: { loggedIn: boolean }) {
    const [prompt, setPrompt] = useState("");
    const [showCaptcha, setShowCaptcha] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedModel, setSelectedModel] = useState<string>("");
    const [selectedTool, setSelectedTool] = useState<string>("Logit Lens");
    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
    const captchaRef = useRef<ElementRef<typeof HCaptcha> | null>(null);
    const router = useRouter();

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
        queryFn: () => getWorkspaces(currentUser!.id),
        enabled: !!isSignedInUser,
    });

    const { data: models, isLoading: modelsLoading, isError: modelsError } = useModelsQuery();
    const modelsToSelect: Model[] = models && models.length > 0 ? models : [];
    const hasModels = modelsToSelect.length > 0;

    // Default to a hot model the current user can actually run when models
    // load — prefer hot+allowed (skips gated models a guest can't use),
    // then any hot, then the first available.
    useEffect(() => {
        if (models && models.length > 0 && (!selectedModel || !models.some((m) => m.name === selectedModel))) {
            const firstUsableHot = models.find((m) => m.status === "hot" && m.allowed);
            const firstHot = models.find((m) => m.status === "hot");
            setSelectedModel((firstUsableHot ?? firstHot ?? models[0]).name);
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
            } else {
                // Redirect to workbench with the prompt and model as query parameters
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

                if (selectedWorkspace && selectedWorkspace !== "new") {
                    params.set("workspaceId", selectedWorkspace);
                }

                window.location.href = `/workbench?${params.toString()}`;
            }
        } catch (err) {
            console.error("Anonymous sign-in error:", err);
            setShowCaptcha(false);
            captchaRef.current?.resetCaptcha();
            setIsSubmitting(false);
        }
    };

    // Check if the selected model is gated
    const isSelectedModelGated = (): boolean => {
        const model = modelsToSelect.find((m) => m.name === selectedModel);
        return model?.gated === true && model?.allowed === false;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Validate based on tool type
        if (selectedTool === "Activation Patching") {
            if (!srcPrompt.trim() || !tgtPrompt.trim() || srcPos.length === 0 || srcPos.length !== tgtPos.length) {
                return;
            }
        } else {
            if (!prompt.trim()) return;
        }

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

        if (selectedWorkspace && selectedWorkspace !== "new") {
            params.set("workspaceId", selectedWorkspace);
        } else {
            params.set("createNew", "true");
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

        // If user is logged in (not anonymous), redirect directly to workbench with prompt
        if (loggedIn && currentUser && !currentUser.is_anonymous) {
            router.push(`/workbench?${params.toString()}`);
        } else {
            // Show captcha for anonymous/non-logged-in users
            setShowCaptcha(true);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && prompt.trim()) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <div className="h-screen w-screen aurora-bg relative overflow-hidden flex flex-col">
            {/* Header */}
            <header className="relative z-10 flex justify-between items-center p-6 w-full shrink-0">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex items-center gap-2"
                >
                    <div className="flex items-center gap-2">
                        <Link href="https://ndif.us" target="_blank">
                            <img src="/images/NDIF.png" alt="NDIF Logo" className="h-8" />
                        </Link>
                        <Link href="https://nnsight.net" target="_blank">
                            <img src="/images/nnsight.svg" alt="nnsight Logo" className="h-8" />
                        </Link>
                        <img src="/images/NSF.png" alt="NSF Logo" className="h-8" />
                    </div>
                    {/* <Brain className="w-8 h-8 text-primary" />
                    <span className="text-xl font-bold bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">
                        Workbench
                    </span> */}
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex items-center gap-3"
                >
                    {loggedIn && (
                        <Link href="/workbench">
                            <Button
                                variant="default"
                                size="default"
                                className="text-white border-0 rounded-full"
                                style={{
                                    background:
                                        "linear-gradient(to right, rgb(37, 99, 235), rgb(147, 51, 234))",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background =
                                        "linear-gradient(to right, rgb(59, 130, 246), rgb(168, 85, 247))";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background =
                                        "linear-gradient(to right, rgb(37, 99, 235), rgb(147, 51, 234))";
                                }}
                            >
                                <Layers className="w-4 h-4" />
                                workspaces
                            </Button>
                        </Link>
                    )}
                    <ModeToggle />
                    {loggedIn ? (
                        <UserDropdown />
                    ) : (
                        <Link href="/login">
                            <Button
                                variant="outline"
                                size="default"
                                className="text-foreground hover:text-white border transition-colors"
                                style={{
                                    background: "transparent",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.background =
                                        "linear-gradient(to right, rgb(59, 130, 246), rgb(168, 85, 247))";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.background = "transparent";
                                }}
                            >
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                                </svg>
                                Log In
                            </Button>
                        </Link>
                    )}
                </motion.div>
            </header>

            {/* Main Content */}
            <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-3 md:px-6 overflow-y-auto">
                <div className="max-w-4xl mx-auto w-full space-y-0 pb-8">
                    {/* Hero Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-center space-y-4 mb-8 md:mb-16"
                    >
                        {/* <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary">
                            <Sparkles className="w-4 h-4" />
                            <span>AI Interpretability Research Platform</span>
                        </div> */}

                        <h1 className="text-5xl lg:text-7xl font-bold tracking-tight pt-2">
                            {/* <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text text-transparent">
                                Explore the Inner
                            </span>
                            <br /> */}
                            <span className="bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-transparent">
                                workbench
                            </span>
                        </h1>

                        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed pt-0">
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

                    {/* Prompt Input Area */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.4 }}
                        className="relative"
                    >
                        <div className="relative bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl shadow-2xl overflow-hidden">
                            {/* Subtle gradient border effect */}
                            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-purple-500/20 to-primary/20 opacity-50 blur-xl" />

                            <div className="relative p-6 space-y-4">
                                <form onSubmit={handleSubmit} className="space-y-4">
                                    {selectedTool === "Logit Lens" ? (
                                        /* Logit Lens - Single prompt input */
                                        <div className="relative">
                                            <Textarea
                                                value={prompt}
                                                onChange={(e) => setPrompt(e.target.value)}
                                                onKeyDown={handleKeyDown}
                                                placeholder="Enter a prompt to analyze..."
                                                className="min-h-[120px] text-lg resize-none bg-background/50 border-border/50 focus:border-primary/50 transition-colors pb-12"
                                                disabled={showCaptcha || isSubmitting}
                                            />

                                        {/* Model Selector - Bottom Left */}
                                        <div className="absolute bottom-3 left-[var(--textarea-padding-x,0.75rem)] flex items-center gap-1.5">
                                            {isSignedInUser && workspacesList && workspacesList.length > 0 && (
                                                <Select
                                                    value={selectedWorkspace}
                                                    onValueChange={setSelectedWorkspace}
                                                    disabled={showCaptcha || isSubmitting}
                                                >
                                                    <SelectTrigger className="h-5 w-fit max-w-[180px] text-[11px] bg-gradient-to-r from-primary/5 to-purple-500/5 border border-primary/10 hover:from-primary/10 hover:to-purple-500/10 hover:border-primary/20 transition-all gap-1 rounded-full focus:ring-0 focus:ring-offset-0 px-2">
                                                        <span className="flex items-center gap-1.5">
                                                            <Layers className="w-3.5 h-3.5 shrink-0 text-current" />
                                                            {selectedWorkspace === "new" && (
                                                                <span className="truncate">New Workspace</span>
                                                            )}
                                                            {selectedWorkspace && selectedWorkspace !== "new" && (
                                                                <span className="truncate">
                                                                    {workspacesList.find((ws: WorkspaceListItem) => ws.id === selectedWorkspace)?.name}
                                                                </span>
                                                            )}
                                                        </span>
                                                    </SelectTrigger>
                                                    <SelectContent className="rounded-xl max-h-60 overflow-y-auto max-w-[220px]">
                                                        <SelectItem value="new" className="text-xs font-medium text-primary">
                                                            <span className="flex items-center gap-1.5">
                                                                <Plus className="w-3 h-3" />
                                                                New Workspace
                                                            </span>
                                                        </SelectItem>
                                                        <SelectSeparator />
                                                        <SelectGroup>
                                                            <SelectLabel>Workspaces</SelectLabel>
                                                            {workspacesList.map((ws: WorkspaceListItem) => (
                                                                <SelectItem key={ws.id} value={ws.id} className="text-xs">
                                                                    <span className="truncate">{ws.name}</span>
                                                                </SelectItem>
                                                            ))}
                                                        </SelectGroup>
                                                    </SelectContent>
                                                </Select>
                                            )}
                                            <Select
                                                value={selectedTool}
                                                onValueChange={setSelectedTool}
                                                disabled={showCaptcha || isSubmitting}
                                            >
                                                <SelectTrigger className="h-5 w-fit text-[11px] bg-gradient-to-r from-primary/5 to-purple-500/5 border border-primary/10 hover:from-primary/10 hover:to-purple-500/10 hover:border-primary/20 transition-all gap-1 rounded-full focus:ring-0 focus:ring-offset-0 px-2">
                                                    <SelectValue placeholder="Select Tool..." />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl">
                                                    <SelectGroup>
                                                        <SelectLabel>Tools</SelectLabel>
                                                        <SelectItem
                                                            key="Logit Lens"
                                                            value="Logit Lens"
                                                            className="text-xs"
                                                        >
                                                            Logit Lens
                                                        </SelectItem>
                                                        <SelectItem
                                                            key="Activation Patching"
                                                            value="Activation Patching"
                                                            className="text-xs"
                                                        >
                                                            Activation Patching
                                                        </SelectItem>
                                                    </SelectGroup>
                                                </SelectContent>
                                            </Select>
                                            <ModelPillOrSelect
                                                modelsLoading={modelsLoading}
                                                modelsError={modelsError}
                                                hasModels={hasModels}
                                                modelsToSelect={modelsToSelect}
                                                selectedModel={selectedModel}
                                                onModelChange={setSelectedModel}
                                                disabled={showCaptcha || isSubmitting}
                                                loggedIn={loggedIn}
                                            />
                                        </div>

                                        {/* Press Enter hint - Bottom Right */}
                                        {prompt.trim() && !showCaptcha && (
                                            <div className="absolute bottom-3 right-3 text-xs text-muted-foreground">
                                                Press Enter to submit
                                            </div>
                                        )}
                                    </div>
                                    ) : (
                                        /* Activation Patching - Dual prompt inputs with token selection */
                                        <div className="space-y-3">
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
                                            />

                                            {/* Tool and Model Selectors */}
                                            <div className="flex items-center gap-1.5 pt-1 flex-wrap">
                                                {isSignedInUser && workspacesList && workspacesList.length > 0 && (
                                                    <Select
                                                        value={selectedWorkspace}
                                                        onValueChange={setSelectedWorkspace}
                                                        disabled={showCaptcha || isSubmitting}
                                                    >
                                                        <SelectTrigger className="h-5 w-fit max-w-[180px] text-[11px] bg-gradient-to-r from-primary/5 to-purple-500/5 border border-primary/10 hover:from-primary/10 hover:to-purple-500/10 hover:border-primary/20 transition-all gap-1 rounded-full focus:ring-0 focus:ring-offset-0 px-2">
                                                            <span className="flex items-center gap-1.5">
                                                            <Layers className="w-3.5 h-3.5 shrink-0 text-current" />
                                                            {selectedWorkspace === "new" && (
                                                                <span className="truncate">New Workspace</span>
                                                            )}
                                                            {selectedWorkspace && selectedWorkspace !== "new" && (
                                                                <span className="truncate">
                                                                    {workspacesList.find((ws: WorkspaceListItem) => ws.id === selectedWorkspace)?.name}
                                                                </span>
                                                            )}
                                                        </span>
                                                        </SelectTrigger>
                                                        <SelectContent className="rounded-xl max-h-60 overflow-y-auto max-w-[220px]">
                                                            <SelectItem value="new" className="text-xs font-medium text-primary">
                                                                <span className="flex items-center gap-1.5">
                                                                    <Plus className="w-3 h-3" />
                                                                    New Workspace
                                                                </span>
                                                            </SelectItem>
                                                            <SelectSeparator />
                                                            <SelectGroup>
                                                                <SelectLabel>Workspaces</SelectLabel>
                                                                {workspacesList.map((ws: WorkspaceListItem) => (
                                                                    <SelectItem key={ws.id} value={ws.id} className="text-xs">
                                                                        <span className="truncate">{ws.name}</span>
                                                                    </SelectItem>
                                                                ))}
                                                            </SelectGroup>
                                                        </SelectContent>
                                                    </Select>
                                                )}
                                                <Select
                                                    value={selectedTool}
                                                    onValueChange={setSelectedTool}
                                                    disabled={showCaptcha || isSubmitting}
                                                >
                                                    <SelectTrigger className="h-5 w-fit text-[11px] bg-gradient-to-r from-primary/5 to-purple-500/5 border border-primary/10 hover:from-primary/10 hover:to-purple-500/10 hover:border-primary/20 transition-all gap-1 rounded-full focus:ring-0 focus:ring-offset-0 px-2">
                                                        <SelectValue placeholder="Select Tool..." />
                                                    </SelectTrigger>
                                                    <SelectContent className="rounded-xl">
                                                        <SelectGroup>
                                                            <SelectLabel>Tools</SelectLabel>
                                                            <SelectItem key="Logit Lens" value="Logit Lens" className="text-xs">
                                                                Logit Lens
                                                            </SelectItem>
                                                            <SelectItem key="Activation Patching" value="Activation Patching" className="text-xs">
                                                                Activation Patching
                                                            </SelectItem>
                                                        </SelectGroup>
                                                    </SelectContent>
                                                </Select>
                                                <ModelPillOrSelect
                                                    modelsLoading={modelsLoading}
                                                    modelsError={modelsError}
                                                    hasModels={hasModels}
                                                    modelsToSelect={modelsToSelect}
                                                    selectedModel={selectedModel}
                                                    onModelChange={setSelectedModel}
                                                    disabled={showCaptcha || isSubmitting}
                                                    loggedIn={loggedIn}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {!showCaptcha ? (
                                        <Button
                                            type="submit"
                                            size="lg"
                                            className="w-full text-base h-12 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-lg shadow-primary/25"
                                            disabled={
                                                isSubmitting || !hasModels ||
                                                (selectedTool === "Logit Lens" ? !prompt.trim() :
                                                    !srcPrompt.trim() || !tgtPrompt.trim() || srcPos.length === 0 || srcPos.length !== tgtPos.length)
                                            }
                                        >
                                            <span>Run</span>
                                            <ArrowRight className="w-5 h-5" />
                                        </Button>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="flex justify-center">
                                                <HCaptcha
                                                    ref={captchaRef}
                                                    sitekey={
                                                        process.env
                                                            .NEXT_PUBLIC_HCAPTCHA_SITEKEY as string
                                                    }
                                                    onVerify={handleCaptchaVerify}
                                                />
                                            </div>
                                            <Button
                                                type="button"
                                                onClick={() => {
                                                    setShowCaptcha(false);
                                                    captchaRef.current?.resetCaptcha();
                                                }}
                                                variant="outline"
                                                className="w-full"
                                            >
                                                Cancel
                                            </Button>
                                        </div>
                                    )}
                                </form>

                                {/* <p className="text-xs text-center text-muted-foreground">
                                    No account needed · Start exploring immediately as a guest
                                </p> */}
                                <p className="text-xs text-center text-muted-foreground">
                                    Log in to access all our models and features.
                                </p>
                            </div>
                        </div>
                    </motion.div>

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
                                className="flex items-center gap-2 px-4 py-2 rounded-full bg-card/50 border border-border/50 backdrop-blur-sm"
                            >
                                <feature.icon className="w-4 h-4 text-primary" />
                                <span className="text-sm text-muted-foreground">
                                    {feature.text}
                                </span>
                            </div>
                        ))}
                    </motion.div> */}
                </div>
            </main>

            {/* Footer */}
            {/* <footer className="relative z-10 py-4 border-t border-border/50 shrink-0">
                <div className="w-full px-6 text-center text-xs text-muted-foreground">
                    <p>Powered by advanced interpretability techniques</p>
                </div>
            </footer> */}
        </div>
    );
}
