"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type SearchInputProps = Omit<React.ComponentProps<"input">, "value" | "onChange"> & {
    value: string;
    onValueChange: (value: string) => void;
};

/** A compact search field: a search icon, the input, and a button that clears it. */
const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
    ({ value, onValueChange, className, ...props }, ref) => (
        <div className={cn("relative", className)}>
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
                ref={ref}
                type="text"
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
                className="h-7 w-full bg-card pl-7 pr-7 text-xs shadow-xs dark:bg-input/30"
                {...props}
            />
            {value && (
                <button
                    type="button"
                    onClick={() => onValueChange("")}
                    aria-label="Clear search"
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                    <X className="size-3" />
                </button>
            )}
        </div>
    ),
);
SearchInput.displayName = "SearchInput";

/**
 * Focuses the search field at `ref` when "/" is pressed outside another
 * field, and clears and leaves it on Escape.
 */
function useSearchShortcut(ref: React.RefObject<HTMLInputElement>, onClear: () => void) {
    React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const inField =
                target?.tagName === "INPUT" ||
                target?.tagName === "TEXTAREA" ||
                target?.isContentEditable;
            if (e.key === "/" && !inField) {
                e.preventDefault();
                ref.current?.focus();
            } else if (e.key === "Escape" && target === ref.current) {
                onClear();
                ref.current?.blur();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [ref, onClear]);
}

export { SearchInput, useSearchShortcut };
