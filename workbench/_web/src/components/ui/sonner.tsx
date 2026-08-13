"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
    const { theme = "system" } = useTheme();

    return (
        <Sonner
            theme={theme as ToasterProps["theme"]}
            className="toaster group"
            style={
                {
                    // The design tokens are raw HSL triplets ("0 0% 100%"), so
                    // they have to be wrapped — handing Sonner a bare
                    // `var(--popover)` yields `background: 0 0% 100%`, which is
                    // invalid, gets dropped, and leaves the toast on Sonner's
                    // own translucent default instead of the popover surface.
                    "--normal-bg": "hsl(var(--popover))",
                    "--normal-text": "hsl(var(--popover-foreground))",
                    "--normal-border": "hsl(var(--border))",
                } as React.CSSProperties
            }
            {...props}
        />
    );
};

export { Toaster };
