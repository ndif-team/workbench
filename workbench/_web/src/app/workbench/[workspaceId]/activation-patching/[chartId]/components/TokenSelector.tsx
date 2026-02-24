"use client";

import { useMemo } from "react";
import { X, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import Select, { MultiValue, StylesConfig, GroupBase, components } from "react-select";

// Option type for react-select
interface TokenOption {
    value: number;
    label: string;
}

// Color palette matching LinePlotWidget
const LINE_COLORS = [
    "#3b82f6",  // blue
    "#ef4444",  // red
    "#22c55e",  // green
    "#f59e0b",  // amber
    "#8b5cf6",  // violet
    "#ec4899",  // pink
    "#06b6d4",  // cyan
    "#84cc16",  // lime
];

// Helper function to render token text with visual indicators for leading spaces and newlines
const renderTokenText = (text: string | undefined): React.ReactNode => {
    if (!text) return "";
    const elements: React.ReactNode[] = [];
    let index = 0;

    // Represent a single leading space with a blue underscore for visibility
    if (text.startsWith(" ")) {
        elements.push(
            <span className="text-blue-500" key="lead-space">
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
    if (buffer) elements.push(<span key="tail">{buffer}</span>);

    return elements.length ? <>{elements}</> : text;
};

// Theme-aware styles for react-select using shadcn/tailwind CSS variables
const selectStyles: StylesConfig<TokenOption, true, GroupBase<TokenOption>> = {
    container: (base) => ({
        ...base,
        width: "100%",
    }),
    control: (base, state) => ({
        ...base,
        backgroundColor: "hsl(var(--background))",
        borderColor: state.isFocused ? "hsl(var(--ring))" : "hsl(var(--input))",
        boxShadow: state.isFocused ? "0 0 0 1px hsl(var(--ring))" : "none",
        boxSizing: "border-box",
        minHeight: "2.25rem",
        fontSize: "0.875rem",
        lineHeight: "1rem",
        alignItems: "center",
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        paddingRight: 0,
        ":hover": {
            borderColor: "hsl(var(--input))",
        },
    }),
    valueContainer: (base) => ({
        ...base,
        position: "relative",
        paddingTop: 4,
        paddingBottom: 4,
        paddingLeft: 8,
        gap: 4,
        alignItems: "center",
        minHeight: "2rem",
        flexWrap: "wrap",
    }),
    input: (base) => ({
        ...base,
        color: "hsl(var(--foreground))",
        margin: 0,
        padding: 0,
        order: 1,
        minWidth: 2,
        paddingLeft: 2,
    }),
    placeholder: (base) => ({
        ...base,
        color: "hsl(var(--muted-foreground))",
        fontSize: "0.875rem",
    }),
    menu: (base) => ({
        ...base,
        backgroundColor: "hsl(var(--popover))",
        border: "1px solid hsl(var(--border))",
        overflow: "hidden",
        zIndex: 50,
        fontSize: "0.75rem",
    }),
    menuList: (base) => ({
        ...base,
        maxHeight: "200px",
        "&::-webkit-scrollbar": {
            width: "6px",
        },
        "&::-webkit-scrollbar-thumb": {
            backgroundColor: "hsl(var(--muted-foreground) / 0.3)",
            borderRadius: "3px",
        },
    }),
    option: (base, state) => ({
        ...base,
        backgroundColor: state.isFocused ? "hsl(var(--accent))" : "transparent",
        color: state.isSelected 
            ? "hsl(var(--muted-foreground))" 
            : state.isFocused 
                ? "hsl(var(--accent-foreground))" 
                : "hsl(var(--popover-foreground))",
        fontSize: "0.875rem",
        padding: "8px 12px",
        cursor: "pointer",
        ":active": {
            backgroundColor: "hsl(var(--accent))",
        },
    }),
    noOptionsMessage: (base) => ({
        ...base,
        color: "hsl(var(--muted-foreground))",
        fontSize: "0.875rem",
    }),
};

// Custom MultiValue component with colored indicator
const CustomMultiValue = (props: any) => {
    const color = LINE_COLORS[props.data.value % LINE_COLORS.length];
    
    return (
        <div
            className={cn(
                "inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 rounded text-sm cursor-default transition-colors",
                "bg-secondary border border-input hover:bg-violet-500/10 hover:border-violet-500/30 group"
            )}
        >
            <span className="text-muted-foreground group-hover:text-violet-600">
                {renderTokenText(props.data.label)}
            </span>
            <button
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    props.removeProps.onClick(e);
                }}
                onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
                className="ml-0.5 text-muted-foreground/50 hover:text-violet-500 transition-colors"
            >
                <X className="w-3 h-3" />
            </button>
        </div>
    );
};

// Custom Option component with badges for source/target predictions
const CustomOption = (props: any) => {
    const tokenIndex = props.data.value;
    const badge = tokenIndex === 0 ? "source pred" : tokenIndex === 1 ? "target pred" : null;
    
    return (
        <components.Option {...props}>
            <div className="flex items-center justify-between w-full gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{renderTokenText(props.data.label)}</span>
                    {badge && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded bg-violet-500/15 text-violet-500 border border-violet-500/20">
                            {badge}
                        </span>
                    )}
                </div>
                {props.isSelected && (
                    <span className="flex-shrink-0 text-xs text-muted-foreground">selected</span>
                )}
            </div>
        </components.Option>
    );
};

// Token selector component props
export interface TokenSelectorProps {
    allLabels: string[];
    selectedIndices: Set<number>;
    onChange: (indices: number[]) => void;
    defaultIndices: Set<number>;
    disabled?: boolean;
}

export function TokenSelector({ allLabels, selectedIndices, onChange, defaultIndices, disabled }: TokenSelectorProps) {
    // Build options from all labels
    const options: TokenOption[] = useMemo(() => {
        return allLabels.map((label, index) => ({
            value: index,
            label: label,
        }));
    }, [allLabels]);

    // Get selected options
    const selectedOptions: TokenOption[] = useMemo(() => {
        return Array.from(selectedIndices)
            .sort((a, b) => a - b)
            .map(index => ({
                value: index,
                label: allLabels[index] || `Token ${index}`,
            }));
    }, [selectedIndices, allLabels]);

    // Handle change
    const handleChange = (newValue: MultiValue<TokenOption>) => {
        const newIndices = newValue.map(opt => opt.value);
        onChange(newIndices);
    };

    // Reset to default (first two tokens - source and target predictions)
    const handleReset = () => {
        onChange(Array.from(defaultIndices));
    };

    // Check if current selection differs from default
    const isDefaultSelection = useMemo(() => {
        if (selectedIndices.size !== defaultIndices.size) return false;
        for (const idx of selectedIndices) {
            if (!defaultIndices.has(idx)) return false;
        }
        return true;
    }, [selectedIndices, defaultIndices]);

    if (allLabels.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-col gap-1.5 w-full">
            <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Tokens ({allLabels.length})</span>
                <div className="flex items-center gap-2">
                    {!isDefaultSelection && (
                        <button
                            className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                            onClick={handleReset}
                            disabled={disabled}
                        >
                            <RotateCcw className="w-3 h-3" />
                            Reset
                        </button>
                    )}
                </div>
            </div>
            <div className="w-full">
                <Select<TokenOption, true>
                    isMulti
                    options={options}
                    value={selectedOptions}
                    onChange={handleChange}
                    styles={selectStyles}
                    placeholder="Search tokens..."
                    closeMenuOnSelect={false}
                    hideSelectedOptions={false}
                    isClearable={false}
                    isDisabled={disabled}
                    menuPlacement="auto"
                    components={{
                        IndicatorSeparator: () => null,
                        DropdownIndicator: () => null,
                        ClearIndicator: () => null,
                        MultiValue: CustomMultiValue,
                        Option: CustomOption,
                    }}
                    noOptionsMessage={() => "No tokens found"}
                    filterOption={(option, inputValue) => {
                        return option.label.toLowerCase().includes(inputValue.toLowerCase());
                    }}
                    onKeyDown={(e) => {
                        // Allow spacebar to type normally instead of triggering react-select behavior
                        if (e.key === " " || e.key === "Spacebar") {
                            e.preventDefault();
                            e.stopPropagation();
                            // Manually insert space into the input
                            const input = e.target as HTMLInputElement;
                            if (input && input.tagName === "INPUT") {
                                const start = input.selectionStart || 0;
                                const end = input.selectionEnd || 0;
                                const value = input.value;
                                const newValue = value.substring(0, start) + " " + value.substring(end);
                                // Trigger the input change via native setter
                                const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                                    window.HTMLInputElement.prototype,
                                    "value"
                                )?.set;
                                if (nativeInputValueSetter) {
                                    nativeInputValueSetter.call(input, newValue);
                                    input.dispatchEvent(new Event("input", { bubbles: true }));
                                    // Restore cursor position
                                    setTimeout(() => {
                                        input.setSelectionRange(start + 1, start + 1);
                                    }, 0);
                                }
                            }
                        }
                    }}
                />
            </div>
        </div>
    );
}
