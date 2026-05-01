import type { WorkshopExamplePayload } from "@/types/workshop";
import { TrajectoryComparison } from "@/components/branching/TrajectoryComparison";
import { HeatStrip } from "@/components/commitment-strip/HeatStrip";

interface PayloadStubProps {
    payload: WorkshopExamplePayload;
}

export function PayloadStub({ payload }: PayloadStubProps) {
    if (payload.record_type === "branching_generation_set") {
        return (
            <div data-testid="payload-stub-branching" className="rounded-md border p-4 bg-muted/30">
                <p className="text-sm text-muted-foreground mb-2">Prompt:</p>
                <p className="font-mono text-sm mb-4">{payload.prompt}</p>
                <TrajectoryComparison payload={payload} />
                {/* Per-sample shorthand (kept for E2E backwards-compat). */}
                <div className="hidden">
                    {payload.samples.map((s, i) => (
                        <div key={i} data-testid={`branching-sample-${i}`}>
                            {s.completion_text}
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    if (payload.record_type === "commitment_strip") {
        return (
            <div
                data-testid="payload-stub-commitment-strip"
                className="rounded-md border p-4 bg-muted/30"
            >
                <p className="text-sm text-muted-foreground mb-2">Prompt:</p>
                <p className="font-mono text-sm mb-3">{payload.prompt}</p>
                <HeatStrip payload={payload} />
            </div>
        );
    }
    return (
        <div data-testid="payload-stub-prompt-influence" className="rounded-md border p-4 bg-muted/30">
            <p className="text-sm text-muted-foreground">
                Prompt influence preview ({payload.attributions.length} attributions). Feature C UI
                is Phase 2; this is fixture-only.
            </p>
        </div>
    );
}
