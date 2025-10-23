import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

/**
 * Resolves CSS variables to concrete color strings for Canvas compatibility
 */
export function hslFromCssVar(name: string, fallback = "#000000"): string {
    if (typeof window === "undefined") return fallback;
    const root = document.documentElement;
    const raw = getComputedStyle(root).getPropertyValue(name).trim();
    return raw ? `hsl(${raw})` : fallback;
}

/**
 * Recursively processes a theme object, converting CSS variable strings to concrete colors
 * for Canvas compatibility. Only processes strings that match the pattern "hsl(var(--...))"
 */
export function resolveThemeCssVars(obj: any): any {
    if (typeof obj === "string") {
        // Match CSS variable pattern: hsl(var(--variable-name))
        const cssVarMatch = obj.match(/^hsl\(var\((--.+?)\)\)$/);
        if (cssVarMatch) {
            const varName = cssVarMatch[1];
            return hslFromCssVar(varName, obj); // fallback to original if resolution fails
        }
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(resolveThemeCssVars);
    }

    if (obj !== null && typeof obj === "object") {
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = resolveThemeCssVars(value);
        }
        return result;
    }

    return obj;
}
