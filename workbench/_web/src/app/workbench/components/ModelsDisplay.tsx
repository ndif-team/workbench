"use client";

import { useQuery } from "@tanstack/react-query";
import { getModels, getAllModels } from "@/lib/api/modelsApi";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useState, useEffect } from "react";
import { Layers, Grip } from "lucide-react";

function BaseModelCard({
    model,
}: {
    model: { name: string; allowed: boolean; n_layers: number; params: string };
}) {
    const [isHovered, setIsHovered] = useState(false);
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        const checkDark = () => {
            const isDarkMode = document.documentElement.classList.contains("dark");
            setIsDark(isDarkMode);
        };

        checkDark();

        const observer = new MutationObserver(checkDark);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });

        return () => observer.disconnect();
    }, []);

    const lightGradient = "linear-gradient(to bottom right, #dbeafe, #eff6ff, #ffffff)"; // blue-100, blue-50, white
    const darkGradient =
        "linear-gradient(135deg, rgba(59, 130, 246, 0.35) 0%, rgba(96, 165, 250, 0.25) 50%, rgba(37, 99, 235, 0.15) 100%)"; // brighter blue shades

    return (
        <a
            href={`https://huggingface.co/${model.name}`}
            target="_blank"
            rel="noopener noreferrer"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div
                className="h-full px-3 py-3 rounded-lg border transition-all hover:shadow-md hover:shadow-blue-500/20 hover:-translate-y-0.5 cursor-pointer"
                style={{
                    borderColor: isDark ? "rgba(96, 165, 250, 0.6)" : "rgba(59, 130, 246, 0.6)", // blue-400 dark, blue-500 light (darker)
                    backgroundImage: isDark ? darkGradient : lightGradient,
                }}
            >
                <div className="flex flex-col gap-1.5">
                    <div
                        className="text-sm font-medium break-words line-clamp-2 transition-colors leading-tight"
                        style={{ color: isHovered ? (isDark ? "#bfdbfe" : "#2563eb") : "inherit" }}
                    >
                        {model.name}
                    </div>
                    <div className="flex items-center justify-between">
                        <div
                            className="text-[10px] font-medium uppercase tracking-wide"
                            style={{ color: isDark ? "#bfdbfe" : "#2563eb" }}
                        >
                            Base
                        </div>
                        <div
                            className="flex items-center gap-2 text-[10px] font-light"
                            style={{ color: isDark ? "#93c5fd" : "#60a5fa" }}
                        >
                            <div className="flex items-center gap-0.5">
                                <Grip className="w-3 h-3" />
                                {model.params}
                            </div>
                            <div className="flex items-center gap-0.5">
                                <Layers className="w-3 h-3" />
                                {model.n_layers}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </a>
    );
}

function ChatModelCard({
    model,
}: {
    model: { name: string; allowed: boolean; n_layers: number; params: string };
}) {
    const [isHovered, setIsHovered] = useState(false);
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        // Initial check
        const checkDark = () => {
            const isDarkMode = document.documentElement.classList.contains("dark");
            console.log("Dark mode:", isDarkMode); // Debug log
            setIsDark(isDarkMode);
        };

        checkDark();

        // Watch for class changes
        const observer = new MutationObserver(checkDark);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });

        return () => observer.disconnect();
    }, []);

    const lightGradient = "linear-gradient(to bottom right, #f3e8ff, #faf5ff, #ffffff)";
    const darkGradient =
        "linear-gradient(135deg, rgba(147, 51, 234, 0.35) 0%, rgba(168, 85, 247, 0.25) 50%, rgba(126, 34, 206, 0.15) 100%)";

    return (
        <a
            href={`https://huggingface.co/${model.name}`}
            target="_blank"
            rel="noopener noreferrer"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            <div
                className="h-full px-3 py-3 rounded-lg border transition-all hover:shadow-md hover:shadow-purple-500/20 hover:-translate-y-0.5 cursor-pointer"
                style={{
                    borderColor: isDark ? "rgba(192, 132, 252, 0.6)" : "rgba(147, 51, 234, 0.6)", // purple-400 dark, purple-600 light (darker)
                    backgroundImage: isDark ? darkGradient : lightGradient,
                }}
            >
                <div className="flex flex-col gap-1.5">
                    <div
                        className="text-sm font-medium break-words line-clamp-2 transition-colors leading-tight"
                        style={{ color: isHovered ? (isDark ? "#e9d5ff" : "#9333ea") : "inherit" }}
                    >
                        {model.name}
                    </div>
                    <div className="flex items-center justify-between">
                        <div
                            className="text-[10px] font-medium uppercase tracking-wide"
                            style={{ color: isDark ? "#e9d5ff" : "#9333ea" }}
                        >
                            Chat
                        </div>
                        <div
                            className="flex items-center gap-2 text-[10px] font-light"
                            style={{ color: isDark ? "#e9d5ff" : "#c084fc" }}
                        >
                            <div className="flex items-center gap-0.5">
                                <Grip className="w-3 h-3" />
                                {model.params}
                            </div>
                            <div className="flex items-center gap-0.5">
                                <Layers className="w-3 h-3" />
                                {model.n_layers}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </a>
    );
}

export function ModelsDisplay() {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        const checkDark = () => {
            setIsDark(document.documentElement.classList.contains("dark"));
        };

        checkDark();

        const observer = new MutationObserver(checkDark);
        observer.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });

        return () => observer.disconnect();
    }, []);

    const {
        data: modelsResponse,
        isLoading,
        error,
    } = useQuery({
        queryKey: ["models"],
        queryFn: getModels,
        refetchInterval: 120000,
    });

    // Get union of all models across all tools
    const models = modelsResponse ? getAllModels(modelsResponse) : [];

    const baseModels = models.filter((model) => model.type === "base");
    const chatModels = models.filter((model) => model.type === "chat");

    if (isLoading) {
        return (
            <div className="mb-6 p-4 border rounded bg-gray-50">
                <h2 className="text-lg mb-3">Models</h2>
                <div className="text-sm text-gray-500">Loading models...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="mb-6 p-4 border rounded bg-destructive/10 border-destructive/20">
                <h2 className="text-lg mb-3 text-destructive">Models</h2>
                <div className="text-sm text-destructive/80">
                    Error loading models: {error.message}
                </div>
            </div>
        );
    }

    return (
        <div
            className="mb-6 rounded-lg transition-all"
            style={{
                border: isDark
                    ? "2px solid rgba(148, 163, 184, 0.3)"
                    : "2px solid rgba(148, 163, 184, 0.25)",
                backgroundColor: isDark ? "rgba(30, 41, 59, 0.5)" : "rgba(241, 245, 249, 0.7)",
                boxShadow: isDark
                    ? "0 2px 8px 0 rgba(0, 0, 0, 0.3)"
                    : "0 2px 8px 0 rgba(0, 0, 0, 0.08)",
            }}
        >
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full p-6 flex items-center justify-between transition-all rounded-lg"
                style={{
                    backgroundColor: isExpanded
                        ? "transparent"
                        : isDark
                          ? "rgba(51, 65, 85, 0.3)"
                          : "rgba(226, 232, 240, 0.5)",
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isDark
                        ? "rgba(51, 65, 85, 0.4)"
                        : "rgba(226, 232, 240, 0.7)";
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isExpanded
                        ? "transparent"
                        : isDark
                          ? "rgba(51, 65, 85, 0.3)"
                          : "rgba(226, 232, 240, 0.5)";
                }}
            >
                <div className="flex items-center gap-3">
                    <h2 className="text-lg">Models</h2>
                    {!isExpanded && baseModels.length > 0 && (
                        <div
                            className="text-xs px-3 py-1 rounded-full"
                            style={{
                                color: isDark ? "#bfdbfe" : "#2563eb",
                                backgroundColor: isDark
                                    ? "rgba(59, 130, 246, 0.2)"
                                    : "rgba(59, 130, 246, 0.1)",
                            }}
                        >
                            {baseModels.length} Base
                        </div>
                    )}
                    {!isExpanded && chatModels.length > 0 && (
                        <div
                            className="text-xs px-3 py-1 rounded-full"
                            style={{
                                color: isDark ? "#e9d5ff" : "#9333ea",
                                backgroundColor: isDark
                                    ? "rgba(147, 51, 234, 0.2)"
                                    : "rgba(147, 51, 234, 0.1)",
                            }}
                        >
                            {chatModels.length} Chat
                        </div>
                    )}
                </div>
                <svg
                    className="w-5 h-5 transition-transform duration-200"
                    style={{ transform: isExpanded ? "rotate(0deg)" : "rotate(180deg)" }}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 15l7-7 7 7"
                    />
                </svg>
            </button>

            {isExpanded && (
                <div className="px-6 pb-6">
                    {/* Base Models */}
                    {baseModels.length > 0 && (
                        <div className="mb-6">
                            {/* <h3 className="font-medium mb-3 text-sm" style={{ color: '#2563eb' }}>Base</h3> */}
                            <div className="grid grid-cols-4 gap-2">
                                {baseModels.map((model) =>
                                    !model.allowed ? (
                                        <Tooltip key={model.name}>
                                            <TooltipTrigger asChild>
                                                <div
                                                    className="group relative px-3 py-3 rounded-lg border-2 border-dashed transition-all cursor-not-allowed opacity-60"
                                                    style={{
                                                        borderColor: "#93c5fd",
                                                        backgroundImage:
                                                            "linear-gradient(to bottom right, #dbeafe, #eff6ff, #eff6ff)",
                                                    }}
                                                >
                                                    <div className="flex flex-col gap-1.5">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div
                                                                className="text-sm font-medium break-words line-clamp-2 leading-tight"
                                                                style={{ color: "#60a5fa" }}
                                                            >
                                                                {model.name}
                                                            </div>
                                                            <div
                                                                className="flex-shrink-0 w-2 h-2 rounded-full mt-0.5"
                                                                style={{
                                                                    backgroundColor: "#60a5fa",
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <div
                                                                className="text-[10px] font-medium uppercase tracking-wide"
                                                                style={{ color: "#60a5fa" }}
                                                            >
                                                                Base
                                                            </div>
                                                            <div
                                                                className="flex items-center gap-2 text-[10px] font-light"
                                                                style={{ color: "#60a5fa" }}
                                                            >
                                                                <div className="flex items-center gap-0.5">
                                                                    <Grip className="w-3 h-3" />
                                                                    {model.params}
                                                                </div>
                                                                <div className="flex items-center gap-0.5">
                                                                    <Layers className="w-3 h-3" />
                                                                    {model.n_layers}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent
                                                className="bg-yellow-100 text-yellow-900 [&]:!bg-yellow-100"
                                                style={{ backgroundColor: "rgb(254 249 195)" }}
                                            >
                                                Log in to use this model.
                                            </TooltipContent>
                                        </Tooltip>
                                    ) : (
                                        <BaseModelCard key={model.name} model={model} />
                                    ),
                                )}
                            </div>
                        </div>
                    )}

                    {/* Chat Models */}
                    {chatModels.length > 0 && (
                        <div>
                            {/* <h3 className="font-medium mb-3 text-sm" style={{ color: '#9333ea' }}>Chat</h3> */}
                            <div className="grid grid-cols-4 gap-2">
                                {chatModels.map((model) =>
                                    !model.allowed ? (
                                        <Tooltip key={model.name}>
                                            <TooltipTrigger asChild>
                                                <div
                                                    className="group relative px-3 py-3 rounded-lg border-2 border-dashed transition-all cursor-not-allowed opacity-60"
                                                    style={{
                                                        borderColor: "#d8b4fe",
                                                        backgroundImage:
                                                            "linear-gradient(to bottom right, #f3e8ff, #faf5ff, #faf5ff)",
                                                    }}
                                                >
                                                    <div className="flex flex-col gap-1.5">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <div
                                                                className="text-sm font-medium break-words line-clamp-2 leading-tight"
                                                                style={{ color: "#c084fc" }}
                                                            >
                                                                {model.name}
                                                            </div>
                                                            <div
                                                                className="flex-shrink-0 w-2 h-2 rounded-full mt-0.5"
                                                                style={{
                                                                    backgroundColor: "#c084fc",
                                                                }}
                                                            />
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <div
                                                                className="text-[10px] font-medium uppercase tracking-wide"
                                                                style={{ color: "#c084fc" }}
                                                            >
                                                                Chat
                                                            </div>
                                                            <div
                                                                className="flex items-center gap-2 text-[10px] font-light"
                                                                style={{ color: "#c084fc" }}
                                                            >
                                                                <div className="flex items-center gap-0.5">
                                                                    <Grip className="w-3 h-3" />
                                                                    {model.params}
                                                                </div>
                                                                <div className="flex items-center gap-0.5">
                                                                    <Layers className="w-3 h-3" />
                                                                    {model.n_layers}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </TooltipTrigger>
                                            <TooltipContent
                                                className="bg-yellow-100 text-yellow-900 [&]:!bg-yellow-100"
                                                style={{ backgroundColor: "rgb(254 249 195)" }}
                                            >
                                                Log in to use this model.
                                            </TooltipContent>
                                        </Tooltip>
                                    ) : (
                                        <ChatModelCard key={model.name} model={model} />
                                    ),
                                )}
                            </div>
                        </div>
                    )}

                    {baseModels.length === 0 && chatModels.length === 0 && (
                        <div className="text-sm text-muted-foreground italic text-center py-8">
                            No models available
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
