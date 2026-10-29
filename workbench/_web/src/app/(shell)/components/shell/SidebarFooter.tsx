"use client";

import Link from "next/link";
import { HelpCircle, MessageSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ModeToggle } from "@/components/ui/mode-toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserDropdown } from "@/components/UserDropdown";
import { cn } from "@/lib/utils";

const FEEDBACK_URL = "https://forms.gle/WsxmZikeLNw34LBV9";
const HELP_URL =
    "https://www.lesswrong.com/posts/AcKRB8wDpdaN6v6ru/interpreting-gpt-the-logit-lens";
const GITHUB_URL = "https://github.com/ndif-team/workbench";

function GitHubMark({ className }: { className?: string }) {
    return (
        <svg className={className} viewBox="0 0 24 24" aria-hidden>
            <path
                d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                fill="currentColor"
            />
        </svg>
    );
}

/** An external link as an icon button with a tooltip. */
function FooterLink({
    href,
    label,
    side,
    children,
}: {
    href: string;
    label: string;
    side: "top" | "right";
    children: React.ReactNode;
}) {
    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground"
                    asChild
                >
                    <Link href={href} target="_blank" rel="noopener noreferrer" aria-label={label}>
                        {children}
                    </Link>
                </Button>
            </TooltipTrigger>
            <TooltipContent side={side}>{label}</TooltipContent>
        </Tooltip>
    );
}

/**
 * The sidebar's footer: account, theme, and the app's outside links
 * (feedback form, logit lens explainer, source). A row when the sidebar is
 * expanded, a column on the rail.
 */
export function SidebarFooter({ orientation }: { orientation: "row" | "column" }) {
    const side = orientation === "row" ? "top" : "right";
    return (
        <div
            className={cn(
                "flex shrink-0 items-center gap-0.5 border-t p-2",
                orientation === "column" && "flex-col",
            )}
        >
            <UserDropdown menuSide={side} menuAlign="start" compact={orientation === "column"} />
            <ModeToggle />
            {orientation === "row" && <div className="flex-1" />}
            <FooterLink href={HELP_URL} label="How the logit lens works" side={side}>
                <HelpCircle />
            </FooterLink>
            <FooterLink href={GITHUB_URL} label="Source on GitHub" side={side}>
                <GitHubMark className="size-4" />
            </FooterLink>
            {orientation === "row" ? (
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                    asChild
                >
                    <Link href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer">
                        <MessageSquare />
                        Feedback
                    </Link>
                </Button>
            ) : (
                <FooterLink href={FEEDBACK_URL} label="Feedback" side={side}>
                    <MessageSquare />
                </FooterLink>
            )}
        </div>
    );
}
