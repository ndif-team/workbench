import React from "react";
import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { TourProvider } from "@/components/providers/TourProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
    title: "Logit Lens - NDIF",
    description: "National Deep Inference Fabric",
    icons: {
        icon: "/images/favicon.png",
    },
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
                <Toaster position="bottom-center" />
            </body>
        </html>
    );
}
