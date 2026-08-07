"use client";

import ReactMarkdown, { type Components } from "react-markdown";

/**
 * Markdown for tutorial copy, styled to this app rather than to a prose reset.
 *
 * Slide bodies are authored in the DB (admin-editable), so the renderer is the
 * safety boundary as well as the styling: react-markdown ignores raw HTML unless
 * `rehype-raw` is added, and it is deliberately not, so authored content can only
 * produce the elements mapped below.
 *
 * No `prose` classes — Tailwind Typography isn't a dependency here, and the app's
 * type scale (`text-sm`/`text-xs`, no arbitrary sizes) is the house style.
 */

const components: Components = {
    p: ({ children }) => <p className="text-sm leading-relaxed">{children}</p>,
    strong: ({ children }) => <strong className="font-medium">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    ul: ({ children }) => (
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed">{children}</ul>
    ),
    ol: ({ children }) => (
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-sm leading-relaxed">
            {children}
        </ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    // Prompts and tokens are the only things in tutorial copy that read as data,
    // which is exactly what font-mono is reserved for here.
    code: ({ children }) => (
        <code className="rounded border bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
    ),
    pre: ({ children }) => (
        <pre className="overflow-auto rounded border bg-muted p-2 font-mono text-xs whitespace-pre-wrap">
            {children}
        </pre>
    ),
    // A slide's heading is the dialog title; a heading inside the body is a
    // sub-heading, so all levels render at the same modest weight.
    h1: ({ children }) => <h3 className="text-sm font-medium">{children}</h3>,
    h2: ({ children }) => <h3 className="text-sm font-medium">{children}</h3>,
    h3: ({ children }) => <h3 className="text-sm font-medium">{children}</h3>,
    blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm leading-relaxed">
            {children}
        </blockquote>
    ),
    a: ({ href, children }) => (
        <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary underline underline-offset-2"
        >
            {children}
        </a>
    ),
    hr: () => <hr className="border-t" />,
};

interface TutorialMarkdownProps {
    /** The markdown source to render. */
    children: string;
}

export function TutorialMarkdown({ children }: TutorialMarkdownProps) {
    return (
        <div className="flex flex-col gap-3">
            <ReactMarkdown components={components}>{children}</ReactMarkdown>
        </div>
    );
}
