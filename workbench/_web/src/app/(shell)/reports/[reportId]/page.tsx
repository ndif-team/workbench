"use client";

import { useParams } from "next/navigation";
import { Editor } from "./components/Editor";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function OverviewPage() {
    const isMobile = useIsMobile();
    // A new editor per report: it holds the report it opened on.
    const { reportId } = useParams<{ reportId: string }>();

    if (isMobile === undefined) return null;

    if (isMobile) {
        return (
            <div className="flex flex-col size-full min-h-0 overflow-auto p-2 pt-0">
                <div className="size-full border rounded dark:bg-secondary/60 bg-secondary/80 min-h-[80vh]">
                    <Editor key={reportId} />
                </div>
            </div>
        );
    }

    return (
        <div className="size-full min-h-0 px-3 pb-3">
            <div className="size-full border rounded dark:bg-secondary/60 bg-secondary/80">
                <Editor key={reportId} />
            </div>
        </div>
    );
}
