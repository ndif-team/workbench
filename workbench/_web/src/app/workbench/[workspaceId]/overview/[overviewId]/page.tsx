"use client";

import ChartCardsSidebar from "../../components/ChartCardsSidebar";
import { Editor } from "./components/Editor";

export default function OverviewPage() {
    return (
        <div className="flex size-full min-h-0">
            <div className="w-[20vw]">
                <ChartCardsSidebar />
            </div>
            <div className="pb-3 pr-3 w-[80vw] min-h-0">
                <div className="size-full border rounded dark:bg-secondary/60 bg-secondary/80">
                    <Editor />
                </div>
            </div>
        </div>
    );
}
