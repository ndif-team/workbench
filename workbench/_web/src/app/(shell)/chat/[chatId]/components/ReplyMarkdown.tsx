import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/**
 * A model's reply rendered as the markdown it is usually written in, with
 * GitHub's tables, task lists and strikethrough, styled to this app's type
 * scale (no `prose` reset), like `TutorialMarkdown`.
 *
 * Replies are model output, so the renderer is a safety boundary: raw HTML
 * shows as the text it is (react-markdown escapes it without `rehype-raw`,
 * which is left out; a `<think>` stays readable), links open in a new tab
 * with unsafe URLs dropped, and an image shows as a link rather than loading
 * whatever URL the model wrote.
 */
export function ReplyMarkdown({ text, className }: { text: string; className?: string }) {
    return (
        <div className={cn("flex min-w-0 flex-col gap-3 text-sm leading-relaxed", className)}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
                {text}
            </ReactMarkdown>
        </div>
    );
}

const heading = "font-semibold [&:not(:first-child)]:mt-2";

const COMPONENTS: Components = {
    p: ({ children }) => <p className="break-words">{children}</p>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    h1: ({ children }) => <h3 className={cn("text-base", heading)}>{children}</h3>,
    h2: ({ children }) => <h3 className={cn("text-base", heading)}>{children}</h3>,
    h3: ({ children }) => <h4 className={cn("text-sm", heading)}>{children}</h4>,
    h4: ({ children }) => <h4 className={cn("text-sm", heading)}>{children}</h4>,
    h5: ({ children }) => <h4 className={cn("text-sm", heading)}>{children}</h4>,
    h6: ({ children }) => <h4 className={cn("text-sm", heading)}>{children}</h4>,
    ul: ({ children, className }) => (
        <ul
            className={cn(
                "flex flex-col gap-1 pl-5",
                className?.includes("contains-task-list") ? "list-none pl-1" : "list-disc",
            )}
        >
            {children}
        </ul>
    ),
    ol: ({ children, start }) => (
        <ol start={start} className="flex list-decimal flex-col gap-1 pl-5">
            {children}
        </ol>
    ),
    li: ({ children }) => (
        <li className="break-words [&>ol]:mt-1 [&>p+p]:mt-2 [&>ul]:mt-1">{children}</li>
    ),
    blockquote: ({ children }) => (
        <blockquote className="flex flex-col gap-2 border-l-2 pl-3 text-muted-foreground">
            {children}
        </blockquote>
    ),
    code: ({ children }) => (
        <code className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
    ),
    pre: ({ children }) => (
        <pre className="overflow-x-auto rounded border bg-muted p-3 font-mono text-xs leading-relaxed [&>code]:border-0 [&>code]:bg-transparent [&>code]:p-0">
            {children}
        </pre>
    ),
    table: ({ children }) => (
        <div className="overflow-x-auto">
            <table className="w-max min-w-full border-collapse text-sm">{children}</table>
        </div>
    ),
    th: ({ children, style }) => (
        <th style={style} className="border bg-muted px-2 py-1 text-left font-medium">
            {children}
        </th>
    ),
    td: ({ children, style }) => (
        <td style={style} className="border px-2 py-1 align-top">
            {children}
        </td>
    ),
    hr: () => <hr className="border-t" />,
    a: ({ href, children }) => (
        <a
            href={href}
            target="_blank"
            rel="noreferrer noopener nofollow"
            className="break-words text-primary underline underline-offset-2"
        >
            {children}
        </a>
    ),
    img: ({ src, alt }) =>
        typeof src === "string" && src ? (
            <a
                href={src}
                target="_blank"
                rel="noreferrer noopener nofollow"
                className="break-words text-primary underline underline-offset-2"
            >
                {alt || src}
            </a>
        ) : (
            <span>{alt}</span>
        ),
};
