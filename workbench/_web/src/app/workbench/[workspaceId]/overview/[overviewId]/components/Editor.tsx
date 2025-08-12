"use client";

import { useRef, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useGetDocument, useSaveDocument } from '@/lib/api/documentApi';

import { EditorState, SerializedEditorState } from 'lexical';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import { CodeNode } from '@lexical/code';
import { LinkNode } from '@lexical/link';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';

import { OnChangePlugin } from './plugins/OnChangePlugin';
import { SlashCommandPlugin } from './plugins/SlashCommandPlugin';
import { ChartEmbedNode } from './nodes/ChartEmbedNode';
import { DragDropChartPlugin } from './plugins/DragDropChartPlugin';

const theme = {
    ltr: 'ltr',
    rtl: 'rtl',
    placeholder: 'text-muted-foreground',
    paragraph: 'mb-2',
    quote: 'border-l-4 border-muted pl-4 italic my-2',
    heading: {
        h1: 'text-3xl font-bold mb-4 mt-6',
        h2: 'text-2xl font-semibold mb-3 mt-5',
        h3: 'text-xl font-medium mb-2 mt-4',
        h4: 'text-lg font-medium mb-2 mt-3',
        h5: 'text-base font-medium mb-1 mt-2',
    },
    list: {
        nested: {
            listitem: 'list-none',
        },
        ol: 'list-decimal ml-4 mb-2',
        ul: 'list-disc ml-4 mb-2',
        listitem: 'mb-1',
    },
    link: 'text-primary underline',
    text: {
        bold: 'font-bold',
        italic: 'italic',
        underline: 'underline',
        strikethrough: 'line-through',
        code: 'px-1 py-0.5 bg-muted rounded text-sm font-mono',
    },
    code: 'block bg-muted rounded p-4 font-mono text-sm my-2',
};

function Placeholder() {
    return <div className="text-muted-foreground absolute top-4 left-4 pointer-events-none">Start writing your overview here...</div>;
}

export function Editor() {
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const editorStateRef = useRef<EditorState | null>(null);
    
    const { workspaceId, overviewId } = useParams<{ workspaceId: string; overviewId: string }>();
    const { data: document, isLoading } = useGetDocument(overviewId);
    const { mutate: saveDocument } = useSaveDocument();

    const initialConfig = {
        namespace: 'LexicalEditor',
        theme,
        nodes: [
            HeadingNode,
            ListNode,
            ListItemNode,
            QuoteNode,
            CodeNode,
            LinkNode,
            ChartEmbedNode,
        ],
        // Lexical expects either an EditorState instance or a JSON string here.
        // We store a SerializedEditorState object in the DB, so stringify it for Lexical to parse.
        editorState: document?.content ? JSON.stringify(document.content) : undefined,
        onError: (error: Error) => {
            console.error('Lexical error:', error);
        },
    };

    const onChange = useCallback((editorState: EditorState) => {
        editorStateRef.current = editorState;
        setHasChanges(true);
    }, []);

    const handleSave = async () => {
        if (!editorStateRef.current) return;
        
        setIsSaving(true);
        try {
            const content: SerializedEditorState = editorStateRef.current.toJSON();
            
            saveDocument(
                { workspaceId, content },
                {
                    onSuccess: () => {
                        setHasChanges(false);
                        setIsSaving(false);
                    },
                    onError: () => {
                        setIsSaving(false);
                    }
                }
            );
        } catch (error) {
            console.error('Failed to save:', error);
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return (
            <div className="h-full w-full flex items-center justify-center p-4">
                <div className="text-muted-foreground">Loading document...</div>
            </div>
        );
    }

    return (
        <div className="h-full w-full flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
                <h2 className="text-lg font-semibold">Document Editor</h2>
                <Button 
                    onClick={handleSave}
                    disabled={isSaving || !hasChanges}
                    size="sm"
                >
                    {isSaving ? 'Saving...' : hasChanges ? 'Save' : 'Saved'}
                </Button>
            </div>
            
            <LexicalComposer initialConfig={initialConfig}>
                <div className="flex flex-col flex-1 min-h-0">
                    {/* Toolbar removed; rely on Markdown shortcuts */}
                    <div className="flex-1 overflow-auto">
                        <div className="relative max-w-4xl mx-auto p-4">
                            <RichTextPlugin
                                contentEditable={
                                    <ContentEditable className="outline-none min-h-[400px]" />
                                }
                                placeholder={<Placeholder />}
                                ErrorBoundary={LexicalErrorBoundary}
                            />
                            <OnChangePlugin onChange={onChange} />
                            <HistoryPlugin />
                            <ListPlugin />
                            {/* <LinkPlugin /> */}
                            <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
                            <AutoFocusPlugin />
                            <SlashCommandPlugin />
                            <DragDropChartPlugin />
                        </div>
                    </div>
                </div>
            </LexicalComposer>
        </div>
    );
}