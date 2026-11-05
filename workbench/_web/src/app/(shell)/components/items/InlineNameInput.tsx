"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Edits a name in place. Focuses and selects on mount; Enter or blur reports
 * the trimmed value, Escape reports null (cancel). Reports once. While
 * `validate` returns a message, it shows under the field, Enter does nothing
 * and blur cancels.
 */
export function InlineNameInput({
    initialValue,
    onDone,
    ariaLabel,
    placeholder,
    className,
    validate,
}: {
    initialValue: string;
    onDone: (value: string | null) => void;
    ariaLabel: string;
    placeholder?: string;
    className?: string;
    validate?: (value: string) => string | null;
}) {
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef<HTMLInputElement>(null);
    const doneRef = useRef(false);
    const errorId = useId();
    const error = value.trim() === initialValue.trim() ? null : (validate?.(value) ?? null);

    useEffect(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
    }, []);

    const finish = (next: string | null) => {
        if (doneRef.current) return;
        doneRef.current = true;
        onDone(next);
    };

    const input = (
        <Input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
                if (e.key === "Enter" && !error) finish(value.trim());
                if (e.key === "Escape") finish(null);
            }}
            onBlur={() => finish(error ? null : value.trim())}
            onClick={(e) => e.stopPropagation()}
            aria-label={ariaLabel}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : undefined}
            placeholder={placeholder}
            className={cn(
                "bg-background shadow-none aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive",
                className,
            )}
        />
    );
    if (!validate) return input;
    return (
        <div className="relative flex min-w-0 flex-1">
            {input}
            {error && (
                <p
                    id={errorId}
                    role="alert"
                    className="absolute left-0 top-full z-20 mt-1 w-max max-w-72 rounded-md border bg-popover px-2 py-1 text-xs text-destructive shadow-md"
                >
                    {error}
                </p>
            )}
        </div>
    );
}
