"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useScopedWorkspaceId } from "@/components/providers/WorkspaceScopeProvider";
import { useReportForEditor, useSaveDocument } from "@/lib/api/documentApi";
import { Button } from "@/components/ui/button";

import { EditorState, SerializedEditorState } from "lexical";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeNode } from "@lexical/code";
import { LinkNode } from "@lexical/link";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { ListPlugin } from "@lexical/react/LexicalListPlugin";
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin";
import { TRANSFORMERS } from "@lexical/markdown";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { AutoFocusPlugin } from "@lexical/react/LexicalAutoFocusPlugin";

import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { ChartEmbedNode } from "./nodes/ChartEmbedNode";
import { DragDropChartPlugin } from "./plugins/DragDropChartPlugin";
import { ExportPdfButton } from "./ExportPdfButton";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";

const theme = {
    ltr: "ltr",
    rtl: "rtl",
    placeholder: "text-muted-foreground",
    paragraph: "mb-3",
    quote: "border-l-4 border-border pl-4 italic my-2",
    heading: {
        h1: "text-3xl font-bold mb-4 mt-6",
        h2: "text-2xl font-semibold mb-3 mt-5",
        h3: "text-xl font-medium mb-3 mt-4",
        h4: "text-lg font-medium mb-3 mt-3",
        h5: "text-base font-medium mb-1 mt-3",
    },
    list: {
        nested: {
            listitem: "list-none",
        },
        ol: "list-decimal ml-4 mb-3",
        ul: "list-disc ml-4 mb-3",
        listitem: "mb-1",
    },
    link: "text-primary underline",
    text: {
        bold: "font-bold",
        italic: "italic",
        underline: "underline",
        strikethrough: "line-through",
        code: "px-1 py-0.5 bg-muted rounded text-sm font-mono",
    },
    code: "block bg-muted rounded p-4 font-mono text-sm my-2",
};

function Placeholder() {
    return (
        <div className="text-muted-foreground absolute top-4 left-4 pointer-events-none">
            Start writing your overview here...
        </div>
    );
}

/**
 * The report editor, which saves 3 s after the last edit (and on leaving the
 * report). It opens only on a copy of the report read since it mounted, never
 * on a cached one or on nothing: a failed read shows an error to retry, as an
 * editor opened empty or on an older copy would save that over the report
 * with its first edit. A save that fails says so; the next edit saves the
 * whole report again.
 */
export function Editor() {
    const { reportId } = useParams<{ reportId: string }>();
    const workspaceId = useScopedWorkspaceId();
    const report = useReportForEditor(reportId);
    const mutation = useSaveDocument();

    // The saved report the editor starts from; later reads (each save sets one
    // off) don't reset what's being edited.
    const [initial, setInitial] = useState<{ content: unknown } | null>(null);
    if (!initial && report.isFetchedAfterMount && report.isSuccess && report.data) {
        setInitial({ content: report.data.content });
    }
    const loadFailed =
        !report.isFetching && (report.isError || (report.isFetchedAfterMount && !report.data));

    const initialConfig = {
        namespace: "LexicalEditor",
        theme,
        nodes: [HeadingNode, ListNode, ListItemNode, QuoteNode, CodeNode, LinkNode, ChartEmbedNode],
        // Lexical expects either an EditorState instance or a JSON string here.
        // We store a SerializedEditorState object in the DB, so stringify it for Lexical to parse.
        editorState: initial?.content ? JSON.stringify(initial.content) : undefined,
        onError: (error: Error) => {
            console.error("Lexical error:", error);
        },
    };

    const [isQueuedToSave, setIsQueuedToSave] = useState(false);
    // The editor's scroll area: charts dropped anywhere on it are embedded.
    const scrollRef = useRef<HTMLDivElement>(null);

    const debouncedSave = useDebouncedCallback(
        async (editorState: EditorState) => {
            if (!editorState) return;
            try {
                const content: SerializedEditorState = editorState.toJSON();
                mutation.mutate({ workspaceId, documentId: reportId, content });
                setIsQueuedToSave(false);
            } catch (error) {
                console.error("Failed to serialize editor state:", error);
            }
        },
        3000,
        { leading: false, trailing: true },
    );

    const handleChange = useCallback(
        (editorState: EditorState) => {
            setIsQueuedToSave(true);
            debouncedSave(editorState);
        },
        [debouncedSave],
    );

    useEffect(() => {
        return () => {
            // Flush pending changes on unmount
            debouncedSave.flush();
        };
    }, [debouncedSave]);

    if (!initial) {
        return (
            <div className="h-full w-full flex items-center justify-center p-4">
                {loadFailed ? (
                    <div role="alert" className="flex flex-col items-center gap-3 text-center">
                        <p className="text-sm text-muted-foreground">
                            Couldn&apos;t load the report.
                        </p>
                        <Button variant="outline" size="sm" onClick={() => report.refetch()}>
                            Try again
                        </Button>
                    </div>
                ) : (
                    <div className="text-muted-foreground">Loading document...</div>
                )}
            </div>
        );
    }

    return (
        <LexicalComposer initialConfig={initialConfig}>
            <div className="h-full w-full flex flex-col">
                <div className="flex items-center justify-end gap-2 border-b h-14 px-3 py-3">
                    <div className="text-xs text-muted-foreground inline-flex items-center gap-2 px-3">
                        {isQueuedToSave || mutation.isPending ? (
                            <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                <span>Saving</span>
                            </>
                        ) : mutation.isError ? (
                            <span className="inline-flex items-center gap-2 text-destructive">
                                <TriangleAlert className="h-3.5 w-3.5" />
                                Not saved
                            </span>
                        ) : (
                            <>
                                <Check className="h-3.5 w-3.5" />
                                <span>Saved</span>
                            </>
                        )}
                    </div>
                    <ExportPdfButton />
                </div>

                <div className="flex flex-col flex-1 min-h-0">
                    {/* Toolbar removed; rely on Markdown shortcuts */}
                    <div ref={scrollRef} className="flex-1 overflow-auto">
                        <div className="relative max-w-4xl mx-auto p-4">
                            <RichTextPlugin
                                contentEditable={
                                    <ContentEditable className="outline-none min-h-[400px]" />
                                }
                                placeholder={<Placeholder />}
                                ErrorBoundary={LexicalErrorBoundary}
                            />
                            <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
                            <HistoryPlugin />
                            <ListPlugin />
                            {/* <LinkPlugin /> */}
                            <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
                            <AutoFocusPlugin />
                            <DragDropChartPlugin dropZoneRef={scrollRef} />
                        </div>
                    </div>
                </div>
            </div>
        </LexicalComposer>
    );
}
