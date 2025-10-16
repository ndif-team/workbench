"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useGetDocument, useSaveDocument } from "@/lib/api/documentApi";

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
// import { SlashCommandPlugin } from './plugins/SlashCommandPlugin';
import { ChartEmbedNode } from "./nodes/ChartEmbedNode";
import { DragDropChartPlugin } from "./plugins/DragDropChartPlugin";
import { Check, Loader2 } from "lucide-react";
import { useDebouncedCallback } from "use-debounce";

const theme = {
  ltr: "ltr",
  rtl: "rtl",
  placeholder: "text-muted-foreground",
  paragraph: "mb-3",
  quote: "border-l-4 border-muted pl-4 italic my-2",
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

export function Editor() {
  const { workspaceId, overviewId } = useParams<{ workspaceId: string; overviewId: string }>();
  const { data: document, isLoading } = useGetDocument(overviewId);
  const mutation = useSaveDocument();

  const initialConfig = {
    namespace: "LexicalEditor",
    theme,
    nodes: [HeadingNode, ListNode, ListItemNode, QuoteNode, CodeNode, LinkNode, ChartEmbedNode],
    // Lexical expects either an EditorState instance or a JSON string here.
    // We store a SerializedEditorState object in the DB, so stringify it for Lexical to parse.
    editorState: document?.content ? JSON.stringify(document.content) : undefined,
    onError: (error: Error) => {
      console.error("Lexical error:", error);
    },
  };

  const [isQueuedToSave, setIsQueuedToSave] = useState(false);

  const debouncedSave = useDebouncedCallback(
    async (editorState: EditorState) => {
      if (!editorState) return;
      try {
        const content: SerializedEditorState = editorState.toJSON();
        mutation.mutate({ workspaceId, documentId: overviewId, content });
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

  useEffect(() => {
    // When the document changes (route change), flush pending save
    debouncedSave.flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overviewId]);

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center p-4">
        <div className="text-muted-foreground">Loading document...</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
      <div className="flex items-center justify-end border-b h-14 px-3 py-3">
        <div className="text-xs text-muted-foreground inline-flex items-center gap-2 px-3">
          {isQueuedToSave || mutation.isPending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Saving</span>
            </>
          ) : (
            <>
              <Check className="h-3.5 w-3.5" />
              <span>Saved</span>
            </>
          )}
        </div>
      </div>

      <LexicalComposer initialConfig={initialConfig}>
        <div className="flex flex-col flex-1 min-h-0">
          {/* Toolbar removed; rely on Markdown shortcuts */}
          <div className="flex-1 overflow-auto">
            <div className="relative max-w-4xl mx-auto p-4">
              <RichTextPlugin
                contentEditable={<ContentEditable className="outline-none min-h-[400px]" />}
                placeholder={<Placeholder />}
                ErrorBoundary={LexicalErrorBoundary}
              />
              <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
              <HistoryPlugin />
              <ListPlugin />
              {/* <LinkPlugin /> */}
              <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
              <AutoFocusPlugin />
              {/* <SlashCommandPlugin /> */}
              <DragDropChartPlugin />
            </div>
          </div>
        </div>
      </LexicalComposer>
    </div>
  );
}
