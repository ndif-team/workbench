import { notFound } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { fetchWorkshopExample } from "@/lib/api/workshopApi";
import { loadWorkshopAnnotation } from "@/actions/workshop";
import { WORKSHOP_TASK_EXAMPLES, WORKSHOP_TASK_LABELS } from "@/lib/workshop-session";
import { TaskHeader } from "../components/TaskHeader";
import { AnnotationPane } from "../components/AnnotationPane";
import { CriticalFramingPrompt } from "../components/CriticalFramingPrompt";
import { BranchingIndicator } from "../components/BranchingIndicator";
import { SessionSummaryExport } from "../components/SessionSummaryExport";
import { PayloadStub } from "../components/PayloadStub";

export const dynamic = "force-dynamic";

function locateExample(exampleId: string) {
    const order: { key: keyof typeof WORKSHOP_TASK_EXAMPLES; ids: readonly string[] }[] = [
        { key: "branching", ids: WORKSHOP_TASK_EXAMPLES.branching },
        { key: "task1_logit_lens", ids: WORKSHOP_TASK_EXAMPLES.task1_logit_lens },
        { key: "task2_patching", ids: WORKSHOP_TASK_EXAMPLES.task2_patching },
        { key: "task3_patchscope", ids: WORKSHOP_TASK_EXAMPLES.task3_patchscope },
    ];
    let flatIdx = 0;
    let total = 0;
    for (const group of order) total += group.ids.length;
    for (const group of order) {
        for (const id of group.ids) {
            if (id === exampleId) {
                return {
                    taskKey: group.key,
                    label: WORKSHOP_TASK_LABELS[group.key],
                    indexInTotal: flatIdx,
                    total,
                };
            }
            flatIdx++;
        }
    }
    return null;
}

interface WorkshopExamplePageProps {
    params: Promise<{ exampleId: string }>;
}

export default async function WorkshopExamplePage({ params }: WorkshopExamplePageProps) {
    const { exampleId } = await params;
    const payload = await fetchWorkshopExample(exampleId);
    if (!payload) notFound();

    const annotation = await loadWorkshopAnnotation(exampleId);
    const located = locateExample(exampleId) ?? {
        taskKey: "branching" as const,
        label: "Workshop example",
        indexInTotal: 0,
        total: 1,
    };

    const framing = payload.critical_framing_prompt ?? "";

    return (
        <div
            data-testid="workshop-example-page"
            data-example-id={exampleId}
            data-record-type={payload.record_type}
            className="min-h-screen flex flex-col"
        >
            <BranchingIndicator />
            <TaskHeader
                label={located.label}
                currentIndex={located.indexInTotal}
                total={located.total}
            />

            <main className="flex-1 max-w-4xl w-full mx-auto p-4 flex flex-col gap-5">
                <PayloadStub payload={payload} />

                {framing && (
                    <CriticalFramingPrompt
                        exampleId={exampleId}
                        promptText={framing}
                        initialResponse={annotation?.framingResponse ?? ""}
                    />
                )}

                <AnnotationPane
                    exampleId={exampleId}
                    initialAnnotation={annotation?.annotationText ?? ""}
                />

                <nav className="flex items-center justify-between border-t pt-4 mt-2">
                    <Link href="/workshop">
                        <Button variant="ghost" data-testid="workshop-back-to-index">
                            ← Back
                        </Button>
                    </Link>
                    <SessionSummaryExport />
                </nav>
            </main>
        </div>
    );
}
