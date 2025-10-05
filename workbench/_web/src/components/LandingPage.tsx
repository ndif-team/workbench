"use client";

import { useState, useRef, type ElementRef } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { ArrowRight, Sparkles, Brain, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import HCaptcha from "@hcaptcha/react-hcaptcha";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import Link from "next/link";

export function LandingPage() {
    const [prompt, setPrompt] = useState("");
    const [showCaptcha, setShowCaptcha] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const captchaRef = useRef<ElementRef<typeof HCaptcha> | null>(null);
    const router = useRouter();

    const handleCaptchaVerify = async (token: string) => {
        const supabase = createClient();
        setIsSubmitting(true);
        
        try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data, error } = await (supabase.auth as any).signInAnonymously({
                options: { captchaToken: token }
            });
            
            if (error) {
                console.error("Anonymous sign-in error:", error);
                setShowCaptcha(false);
                captchaRef.current?.resetCaptcha();
                setIsSubmitting(false);
            } else {
                // Redirect to workbench with the prompt as a query parameter
                const encodedPrompt = encodeURIComponent(prompt);
                window.location.href = `/workbench?prompt=${encodedPrompt}`;
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
        setShowCaptcha(true);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey && prompt.trim()) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 dark:to-primary/10 relative overflow-hidden">
            {/* Animated background elements */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-primary/10 to-transparent rounded-full blur-3xl" />
                <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-purple-500/10 to-transparent rounded-full blur-3xl" />
            </div>

            {/* Header */}
            <header className="relative z-10 flex justify-between items-center p-6 max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    className="flex items-center gap-2"
                >
                    <div className="flex items-center gap-2"
                    >
                        <img
                            src="/images/NDIF.png"
                            alt="NDIF Logo"
                            className="h-8"
                        />
                        <img
                            src="/images/NSF.png"
                            alt="NSF Logo"
                            className="h-8"
                        />
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
                    <ModeToggle />
                    <Link href="/login">
                        <Button variant="outline" size="default">
                            Log In
                        </Button>
                    </Link>
                </motion.div>
            </header>

            {/* Main Content */}
            <main className="relative z-10 flex flex-col items-center justify-center px-6 pt-20 pb-32">
                <div className="max-w-4xl mx-auto w-full space-y-12">
                    {/* Hero Section */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.2 }}
                        className="text-center space-y-6"
                    >
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary mb-4">
                            <Sparkles className="w-4 h-4" />
                            <span>AI Interpretability Research Platform</span>
                        </div>

                        <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight">
                            {/*<span className="bg-gradient-to-r from-foreground via-foreground to-foreground/80 bg-clip-text text-transparent">
                                Explore the Inner
                            </span>
                            <br />*/}
                            <span className="bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-transparent">
                                workbench
                            </span>
                        </h1>

                        <p className="text-xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                            Dive deep into neural network activations, visualize attention patterns,
                            and understand what happens inside large language models.
                        </p>
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
                                            placeholder="Enter a prompt to analyze... (e.g., 'The Eiffel Tower is located in')"
                                            className="min-h-[120px] text-base resize-none bg-background/50 border-border/50 focus:border-primary/50 transition-colors"
                                            disabled={showCaptcha || isSubmitting}
                                        />
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
                                            <span>Start Exploring</span>
                                            <ArrowRight className="w-5 h-5" />
                                        </Button>
                                    ) : (
                                        <div className="space-y-3">
                                            <div className="flex justify-center">
                                                <HCaptcha
                                                    ref={captchaRef}
                                                    sitekey={process.env.NEXT_PUBLIC_HCAPTCHA_SITEKEY as string}
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

                                <p className="text-xs text-center text-muted-foreground">
                                    No account needed · Start exploring immediately as a guest
                                </p>
                            </div>
                        </div>
                    </motion.div>

                    {/* Feature Pills */}
                    <motion.div
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
                    </motion.div>
                </div>
            </main>

            {/* Footer */}
            <footer className="relative z-10 py-8 border-t border-border/50">
                <div className="max-w-7xl mx-auto px-6 text-center text-sm text-muted-foreground">
                    <p>Powered by advanced interpretability techniques</p>
                </div>
            </footer>
        </div>
    );
}

