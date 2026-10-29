"use client";

import { useEffect, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Edits a name in place. Focuses and selects on mount; Enter or blur reports
 * the trimmed value, Escape reports null (cancel). Reports once.
 */
export function InlineNameInput({
    initialValue,
    onDone,
    ariaLabel,
    placeholder,
    className,
}: {
    initialValue: string;
    onDone: (value: string | null) => void;
    ariaLabel: string;
    placeholder?: string;
    className?: string;
}) {
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef<HTMLInputElement>(null);
    const doneRef = useRef(false);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const finish = (next: string | null) => {
        if (doneRef.current) return;
        doneRef.current = true;
        onDone(next);
    };

    return (
        <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === "Enter") finish(value.trim());
                if (e.key === "Escape") finish(null);
            }}
            onBlur={() => finish(value.trim())}
            onClick={(e) => e.stopPropagation()}
            aria-label={ariaLabel}
            placeholder={placeholder}
            className={cn("bg-background shadow-none", className)}
        />
    );
}
