import React from "react";
import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { TourProvider } from "@/components/providers/TourProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { Toaster } from "@/components/ui/sonner";
import { ChatBubbleIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";

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
                        <a
                            href="https://forms.gle/WsxmZikeLNw34LBV9"
                            target="_blank"
                            className="absolute bottom-4 right-4"
                        >
                            <Button className="cursor-pointer button ">
                                <ChatBubbleIcon /> Feedback
                            </Button>
                        </a>
                    </ThemeProvider>
                </QueryProvider>
                <Toaster position="bottom-center" />
            </body>
        </html>
    );
}
