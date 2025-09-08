"use client";

import { ModeToggle } from "@/components/ui/mode-toggle";
import type React from "react";
import { UserDropdown } from "@/components/UserDropdown";
import Link from "next/link";
import { WorkbenchStatus } from "@/components/WorkbenchStatus";
import { CaptureProvider } from "@/components/providers/CaptureProvider";
import { Button } from "@/components/ui/button";
import { ChatBubbleIcon } from "@radix-ui/react-icons";
import { HelpCircle } from "lucide-react";

export default function WorkbenchLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <div className="flex flex-col h-screen bg-gradient-to-tr from-background dark:to-primary/15 to-primary/30">
            <header className="p-3 pl-5 flex items-center justify-between">
                <Link href="/workbench">
                    <div className="flex items-center gap-2">
                        <img src="/images/NDIF.png" alt="NDIF Logo" className="h-8" />
                        <img src="/images/NSF.png" alt="NSF Logo" className="h-8" />
                    </div>
                </Link>

                <nav className="flex gap-3 items-center">
                    <Link href="https://forms.gle/WsxmZikeLNw34LBV9" target="_blank">
                        <Button variant="outline">
                            <ChatBubbleIcon /> Feedback
                        </Button>
                    </Link>
                    <Button variant="outline" size="icon" asChild>
                        <Link
                            href="https://www.lesswrong.com/posts/AcKRB8wDpdaN6v6ru/interpreting-gpt-the-logit-lens"
                            target="_blank"
                        >
                            <HelpCircle className="h-4 w-4" />
                        </Link>
                    </Button>
                    <Button variant="outline" size="icon" asChild>
                        <Link href="https://github.com/ndif-team/workbench" target="_blank">
                            <svg className="h-4 w-4" viewBox="0 0 24 24">
                                <path
                                    d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                                    fill="currentColor"
                                />
                            </svg>
                        </Link>
                    </Button>
                    <WorkbenchStatus />
                    <ModeToggle />
                    <UserDropdown />
                </nav>
            </header>
            <main className="flex-1 min-h-0 overflow-hidden">
                <CaptureProvider>{children}</CaptureProvider>
            </main>
        </div>
    );
}
