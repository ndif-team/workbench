import type { Preview } from "@storybook/nextjs-vite";
import React from "react";
import "../src/app/globals.css";

const preview: Preview = {
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
        a11y: {
            test: "todo",
        },
        backgrounds: {
            disable: true, // We use CSS variables instead
        },
    },
    globalTypes: {
        theme: {
            description: "Global theme for components",
            toolbar: {
                title: "Theme",
                icon: "circlehollow",
                items: [
                    { value: "light", title: "Light", icon: "sun" },
                    { value: "dark", title: "Dark", icon: "moon" },
                ],
                dynamicTitle: true,
            },
        },
    },
    initialGlobals: {
        theme: "light",
    },
    decorators: [
        (Story, context) => {
            const theme = context.globals.theme || "light";
            // Apply theme class to the document
            if (typeof document !== "undefined") {
                document.documentElement.classList.remove("light", "dark");
                document.documentElement.classList.add(theme);
            }
            return (
                <div className={`min-h-screen bg-background text-foreground ${theme}`}>
                    <Story />
                </div>
            );
        },
    ],
};

export default preview;
