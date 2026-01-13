import { useMemo, useState, useRef, useEffect } from "react";
import { useLensWorkspace } from "@/stores/useLensWorkspace";
import { X, Search } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import type { LensConfigData } from "@/types/lens";

// Helper function to render token text with blue underscore for leading spaces and blue "\n" for newlines
const renderTokenText = (text: string | undefined) => {
    if (!text) return "";
    const elements: React.ReactNode[] = [];
    let index = 0;

    // Represent a single leading space with a blue underscore for visibility
    if (text.startsWith(" ")) {
        elements.push(
            <span className="text-blue-500" key={`lead-space`}>
                _
            </span>,
        );
        index = 1;
    }

    let buffer = "";
    for (; index < text.length; index++) {
        const ch = text[index];
        if (ch === "\n") {
            if (buffer) {
                elements.push(<span key={`txt-${index}`}>{buffer}</span>);
                buffer = "";
            }
            elements.push(
                <span className="text-blue-500" key={`nl-${index}`}>
                    \n
                </span>,
            );
        } else {
            buffer += ch;
        }
    }
    if (buffer) elements.push(<span key={`tail`}>{buffer}</span>);

    return elements.length ? <>{elements}</> : text;
};

// Normalize string for matching: lowercase, optionally strip spaces/punctuation
const normalizeForMatch = (str: string, preserveSpecial: boolean): string => {
    if (preserveSpecial) {
        return str.toLowerCase();
    }
    // Remove spaces and punctuation for fuzzy matching
    return str.toLowerCase().replace(/[\s\p{P}]/gu, "");
};

// Check if query matches token with smart matching
const matchesQuery = (token: string, query: string): boolean => {
    if (!query) return true;

    // Check if query has special characters (spaces, punctuation)
    const hasSpecialChars = /[\s\p{P}]/u.test(query);

    if (hasSpecialChars) {
        // Exact match respecting spaces/punctuation (case-insensitive)
        return token.toLowerCase().includes(query.toLowerCase());
    } else {
        // Fuzzy match ignoring spaces/punctuation
        const normalizedToken = normalizeForMatch(token, false);
        const normalizedQuery = normalizeForMatch(query, false);
        return normalizedToken.includes(normalizedQuery);
    }
};

interface TargetTokenSelectorProps {
    configId: string;
    config: LensConfigData;
    setConfig: (config: LensConfigData) => void;
}

// Token option type for the select component (token text + color)
interface PinnedTokenOption {
    value: string; // token text
    label: string;
    color?: string;
    groupIndex?: number;
}

export const TargetTokenSelector = ({ configId, config, setConfig }: TargetTokenSelectorProps) => {
    const { pinnedGroups, togglePinnedTrajectory, widgetRef, trackedTokens } = useLensWorkspace();
    const [searchQuery, setSearchQuery] = useState("");
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const suggestionsRef = useRef<HTMLDivElement>(null);

    // Convert pinned groups to grouped select options (tokens grouped by color)
    const groupedOptions: { color: string; tokens: string[] }[] = useMemo(() => {
        return pinnedGroups.map((group) => ({
            color: group.color,
            tokens: group.tokens,
        }));
    }, [pinnedGroups]);

    // Flat list of all pinned tokens (for pinnedTokenSet)
    const selectedOptions: PinnedTokenOption[] = useMemo(() => {
        const options: PinnedTokenOption[] = [];
        pinnedGroups.forEach((group, groupIndex) => {
            group.tokens.forEach((token) => {
                options.push({
                    value: token,
                    label: token,
                    color: group.color,
                    groupIndex,
                });
            });
        });
        return options;
    }, [pinnedGroups]);

    // Get tokens that are already pinned
    const pinnedTokenSet = useMemo(() => {
        return new Set(selectedOptions.map((opt) => opt.value));
    }, [selectedOptions]);

    // Filter suggestions based on search query
    const suggestions = useMemo(() => {
        if (!searchQuery) return [];
        return trackedTokens
            .filter((token) => !pinnedTokenSet.has(token) && matchesQuery(token, searchQuery))
            .slice(0, 10); // Limit to 10 suggestions
    }, [trackedTokens, searchQuery, pinnedTokenSet]);

    // Reset selected index when suggestions change
    useEffect(() => {
        setSelectedIndex(0);
    }, [suggestions]);

    // Handle clicking outside to close suggestions
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                suggestionsRef.current &&
                !suggestionsRef.current.contains(e.target as Node) &&
                inputRef.current &&
                !inputRef.current.contains(e.target as Node)
            ) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Handle removing a token from pinned groups
    const handleRemoveToken = (tokenText: string) => {
        if (widgetRef) {
            togglePinnedTrajectory(tokenText, false);
        }
    };

    // Handle selecting a suggestion
    const handleSelectSuggestion = (token: string) => {
        if (widgetRef) {
            togglePinnedTrajectory(token, false);
        }
        setSearchQuery("");
        setShowSuggestions(false);
        inputRef.current?.focus();
    };

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!showSuggestions || suggestions.length === 0) {
            if (e.key === "ArrowDown" && searchQuery) {
                setShowSuggestions(true);
            }
            return;
        }

        switch (e.key) {
            case "ArrowDown":
                e.preventDefault();
                setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
                break;
            case "ArrowUp":
                e.preventDefault();
                setSelectedIndex((prev) => Math.max(prev - 1, 0));
                break;
            case "Enter":
                e.preventDefault();
                if (suggestions[selectedIndex]) {
                    handleSelectSuggestion(suggestions[selectedIndex]);
                }
                break;
            case "Escape":
                setShowSuggestions(false);
                break;
        }
    };

    // If no widget is available, show nothing (waiting for widget to load)
    if (!widgetRef) {
        return (
            <div className="flex flex-col gap-1.5 w-full">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="text-xs text-muted-foreground">Pinned Tokens</span>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                        Click tokens in the input or widget table to pin trajectories.
                    </TooltipContent>
                </Tooltip>
                <div className="text-xs text-muted-foreground italic">
                    Loading widget...
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-1.5 w-full">
            <div className="flex justify-between items-center">
                <Tooltip>
                    <TooltipTrigger asChild>
                        <span className="text-xs">Pinned Tokens</span>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                        Click tokens in the input or widget table to pin trajectories.
                    </TooltipContent>
                </Tooltip>

                {selectedOptions.length > 0 && (
                    <button
                        className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                            // Clear all pinned trajectories
                            selectedOptions.forEach((opt) => {
                                togglePinnedTrajectory(opt.value, false);
                            });
                        }}
                    >
                        <X className="w-3 h-3" />
                        Clear All
                    </button>
                )}
            </div>

            {/* Search input with autocomplete */}
            <div className="relative">
                <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                    <Input
                        ref={inputRef}
                        type="text"
                        placeholder="Type to search tokens..."
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setShowSuggestions(true);
                        }}
                        onFocus={() => searchQuery && setShowSuggestions(true)}
                        onKeyDown={handleKeyDown}
                        className="h-7 text-xs pl-7 pr-2"
                    />
                </div>

                {/* Suggestions dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                    <div
                        ref={suggestionsRef}
                        className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-md max-h-48 overflow-auto"
                    >
                        {suggestions.map((token, idx) => (
                            <div
                                key={token}
                                className={`px-2 py-1.5 text-xs cursor-pointer flex items-center gap-2 ${
                                    idx === selectedIndex
                                        ? "bg-accent text-accent-foreground"
                                        : "hover:bg-accent/50"
                                }`}
                                onClick={() => handleSelectSuggestion(token)}
                                onMouseEnter={() => setSelectedIndex(idx)}
                            >
                                <span className="font-mono">{renderTokenText(token)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Display pinned tokens grouped by color */}
            <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
                {groupedOptions.length === 0 ? (
                    <span className="text-xs text-muted-foreground italic">
                        No pinned tokens. Click tokens or search above to pin trajectories.
                    </span>
                ) : (
                    groupedOptions.map((group, groupIdx) => (
                        <div
                            key={`group-${groupIdx}-${group.color}`}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-popover border"
                            style={{
                                borderColor: group.color || undefined,
                                borderLeftWidth: group.color ? 3 : 1,
                            }}
                        >
                            {group.tokens.map((token, tokenIdx) => (
                                <span
                                    key={`${token}-${tokenIdx}`}
                                    className="inline-flex items-center gap-0.5"
                                >
                                    {tokenIdx > 0 && (
                                        <span className="text-muted-foreground/50 mx-0.5">|</span>
                                    )}
                                    <span className="text-muted-foreground font-mono">
                                        {renderTokenText(token)}
                                    </span>
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleRemoveToken(token);
                                        }}
                                        className="text-muted-foreground hover:text-foreground"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </span>
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};
