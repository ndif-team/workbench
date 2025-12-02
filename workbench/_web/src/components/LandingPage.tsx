"use client";

import { useState, useRef, useEffect, type ElementRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { ArrowRight, Sparkles, Brain, Zap, ChevronDown, Layers } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { UserDropdown } from "@/components/UserDropdown";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getModels, getModelsForTool } from "@/lib/api/modelsApi";
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import PromptVisualization from "@/components/PromptVisualization";
import type { Model } from "@/types/models";

type CurrentUser = SupabaseUser & { is_anonymous?: boolean | null };

export function LandingPage({ loggedIn }: { loggedIn: boolean }) {
    const [prompt, setPrompt] = useState("");
    const [showCaptcha, setShowCaptcha] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [selectedModel, setSelectedModel] = useState<string>("openai-community/gpt2");
    const [selectedTool, setSelectedTool] = useState<string>("logit-lens");
    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
    const captchaRef = useRef<ElementRef<typeof HCaptcha> | null>(null);
    const router = useRouter();

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

    const { data: modelsResponse, isLoading: modelsLoading } = useQuery({
        queryKey: ["models"],
        queryFn: getModels,
        refetchInterval: 120000,
    });

    // Get models for the selected tool
    const modelsToSelect: Model[] = modelsResponse 
        ? getModelsForTool(modelsResponse, selectedTool)
        : [
            {
                name: "openai-community/gpt2",
                type: "base",
                n_layers: 12,
                params: "124M",
                gated: false,
                allowed: true,
            },
        ];

    // Update selected model when tool changes if current model is not available
    useEffect(() => {
        if (modelsToSelect.length > 0) {
            const isCurrentModelAvailable = modelsToSelect.some(m => m.name === selectedModel);
            if (!isCurrentModelAvailable) {
                // Set to first available model
                setSelectedModel(modelsToSelect[0].name);
            }
        }
    }, [selectedTool, modelsToSelect, selectedModel]);

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
                // Redirect to workbench with the prompt, model, and tool as query parameters
                const params = new URLSearchParams({
                    prompt: prompt,
                    model: selectedModel,
                    tool: selectedTool,
                });
                window.location.href = `/workbench?${params.toString()}`;
            }
        } catch (err) {
            console.error("Anonymous sign-in error:", err);
            setShowCaptcha(false);
            captchaRef.current?.resetCaptcha();
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!prompt.trim()) return;

        // If user is logged in (not anonymous), redirect directly to workbench with prompt
        if (loggedIn && currentUser && !currentUser.is_anonymous) {
            const params = new URLSearchParams({
                prompt: prompt,
                model: selectedModel,
                tool: selectedTool,
                createNew: "true", // Flag to always create new workspace
            });
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
        <div className="h-screen w-screen bg-gradient-to-br from-background via-background to-primary/5 dark:to-primary/10 relative overflow-hidden flex flex-col">
            {/* Animated background elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl" />
                <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-purple-500/10 to-transparent rounded-full blur-3xl" />
            </div>

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
            <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 overflow-y-auto">
                <div className="max-w-4xl mx-auto w-full space-y-0 pb-8">
                    {/* Hero Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-center space-y-4 mb-16"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary">
                            <Sparkles className="w-4 h-4" />
                            <span>AI Interpretability Research Platform</span>
                        </div>

                        <h1 className="text-5xl lg:text-7xl font-bold tracking-tight pt-2">
                            {/* <span className="bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text text-transparent">
                                Explore the Inner
                            </span>
                            <br /> */}
                            <span className="bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-transparent">
                                workbench
                            </span>
                        </h1>

                        <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed pt-0">
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
                                        <div className="absolute bottom-3 left-[var(--textarea-padding-x,0.75rem)] flex items-center gap-2">
                                            <Select
                                                value={selectedTool}
                                                onValueChange={setSelectedTool}
                                                disabled={showCaptcha || isSubmitting}
                                            >
                                                <SelectTrigger className="h-7 w-fit text-xs bg-gradient-to-r from-primary/10 to-purple-500/10 backdrop-blur-sm border border-primary/20 hover:from-primary/20 hover:to-purple-500/20 hover:border-primary/30 transition-all gap-1.5 rounded-full focus:ring-0 focus:ring-offset-0 shadow-sm">
                                                    <SelectValue placeholder="Select Tool..." />
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl">
                                                    <SelectGroup>
                                                        <SelectLabel>Tools</SelectLabel>
                                                        <SelectItem
                                                            key="logit-lens"
                                                            value="logit-lens"
                                                            className="text-xs"
                                                        >
                                                            Logit Lens
                                                        </SelectItem>
                                                        <SelectItem
                                                            key="concept-lens"
                                                            value="concept-lens"
                                                            className="text-xs"
                                                        >
                                                            Concept Lens
                                                        </SelectItem>
                                                    </SelectGroup>
                                                </SelectContent>
                                            </Select>
                                            <Select
                                                value={selectedModel}
                                                onValueChange={setSelectedModel}
                                                disabled={showCaptcha || isSubmitting}
                                            >
                                                <SelectTrigger className="h-7 w-fit text-xs bg-gradient-to-r from-primary/10 to-purple-500/10 backdrop-blur-sm border border-primary/20 hover:from-primary/20 hover:to-purple-500/20 hover:border-primary/30 transition-all gap-1.5 rounded-full focus:ring-0 focus:ring-offset-0 shadow-sm">
                                                    {modelsLoading ? (
                                                        <span className="text-xs">
                                                            Loading models...
                                                        </span>
                                                    ) : (
                                                        <SelectValue placeholder="Select model..." />
                                                    )}
                                                </SelectTrigger>
                                                <SelectContent className="rounded-xl">
                                                    <SelectGroup>
                                                        <SelectLabel>Models</SelectLabel>
                                                        {modelsLoading ? (
                                                            <SelectItem
                                                                value="loading"
                                                                disabled
                                                                className="text-xs"
                                                            >
                                                                Loading models...
                                                            </SelectItem>
                                                        ) : (
                                                            modelsToSelect?.map((model) =>
                                                                !model.allowed ? (
                                                                    <SelectItem
                                                                        key={model.name}
                                                                        value={model.name}
                                                                        disabled={!model.allowed}
                                                                        className="text-xs opacity-50 cursor-not-allowed"
                                                                    >
                                                                        <div className="flex items-center gap-2">
                                                                            {model.name}
                                                                            <div className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                                                        </div>
                                                                    </SelectItem>
                                                                ) : (
                                                                    <SelectItem
                                                                        key={model.name}
                                                                        value={model.name}
                                                                        className="text-xs"
                                                                    >
                                                                        {model.name}
                                                                    </SelectItem>
                                                                ),
                                                            )
                                                        )}
                                                    </SelectGroup>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* Press Enter hint - Bottom Right */}
                                        {prompt.trim() && !showCaptcha && (
                                            <div className="absolute bottom-3 right-3 text-xs text-muted-foreground">
                                                Press Enter to submit
                                            </div>
                                        )}
                                    </div>

                                    {!showCaptcha ? (
                                        <Button
                                            type="submit"
                                            size="lg"
                                            className="w-full text-base h-12 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90 shadow-lg shadow-primary/25"
                                            disabled={!prompt.trim() || isSubmitting}
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
