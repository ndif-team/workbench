import React from "react";
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { TourProvider } from "@/components/providers/TourProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { Toaster } from "@/components/ui/sonner";
import { PostHogProvider } from "./provider";

const DESCRIPTION = "Explore LLM internals and build your experiments interactively.";

/**
 * Link previews (Discord, Slack, X) read the Open Graph tags; the image is
 * `opengraph-image.png` beside this file. Without `NEXT_PUBLIC_BASE_URL`,
 * Next resolves its absolute URL from the deployment (Vercel's URLs).
 */
export const metadata: Metadata = {
    metadataBase: process.env.NEXT_PUBLIC_BASE_URL
        ? new URL(process.env.NEXT_PUBLIC_BASE_URL)
        : undefined,
    title: "workbench",
    description: DESCRIPTION,
    icons: {
        icon: "/images/favicon.png",
    },
    openGraph: {
        type: "website",
        siteName: "workbench by NDIF",
        title: "workbench",
        description: DESCRIPTION,
    },
    twitter: {
        card: "summary_large_image",
    },
};

/** Discord colors an embed's side stripe with the page's theme color. */
export const viewport: Viewport = {
    themeColor: "#3B82F6",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" suppressHydrationWarning>
            {/* <head>
                <script src="https://unpkg.com/react-scan/dist/auto.global.js" />
            </head> */}
            <body className="antialiased">
                <PostHogProvider>
                    <QueryProvider>
                        <ThemeProvider
                            attribute="class"
                            defaultTheme="light"
                            enableSystem
                            disableTransitionOnChange
                        >
                            <TourProvider>{children}</TourProvider>
                        </ThemeProvider>
                    </QueryProvider>
                </PostHogProvider>
                <Toaster position="bottom-center" />
            </body>
        </html>
    );
}
