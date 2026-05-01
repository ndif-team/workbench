import Link from "next/link";
import { Button } from "@/components/ui/button";
import { fetchWorkshopExample } from "@/lib/api/workshopApi";
import { WORKSHOP_TASK_EXAMPLES, WORKSHOP_TASK_LABELS } from "@/lib/workshop-session";
import { SessionSummaryExport } from "./components/SessionSummaryExport";

export const dynamic = "force-dynamic";

async function loadAvailable(ids: string[]) {
    const out: { id: string; ok: boolean }[] = [];
    for (const id of ids) {
        try {
            const p = await fetchWorkshopExample(id);
            out.push({ id, ok: p !== null });
        } catch {
            out.push({ id, ok: false });
        }
    }
    return out;
}

export default async function WorkshopIndexPage() {
    const branching = await loadAvailable([...WORKSHOP_TASK_EXAMPLES.branching]);
    const task1 = await loadAvailable([...WORKSHOP_TASK_EXAMPLES.task1_logit_lens]);

    return (
        <main
            data-testid="workshop-index"
            className="min-h-screen p-6 max-w-3xl mx-auto flex flex-col gap-6"
        >
            <header>
                <h1 className="text-2xl font-bold">Workshop Mode</h1>
                <p className="text-sm text-muted-foreground mt-1">
                    Pre-loaded examples for the 60-min critical AI literacy workshop. Your
                    reflections are saved automatically to this device.
                </p>
            </header>

            <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">{WORKSHOP_TASK_LABELS.branching}</h2>
                <ul className="flex flex-col gap-2">
                    {branching.map((b) => (
                        <li key={b.id} data-testid={`workshop-link-${b.id}`}>
                            {b.ok ? (
                                <Link href={`/workshop/${b.id}`}>
                                    <Button variant="outline">Open: {b.id}</Button>
                                </Link>
                            ) : (
                                <span className="text-sm text-muted-foreground">
                                    {b.id} — payload not pre-cached yet
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            </section>

            <section className="flex flex-col gap-3">
                <h2 className="text-lg font-semibold">{WORKSHOP_TASK_LABELS.task1_logit_lens}</h2>
                <ul className="flex flex-col gap-2">
                    {task1.map((b) => (
                        <li key={b.id} data-testid={`workshop-link-${b.id}`}>
                            {b.ok ? (
                                <Link href={`/workshop/${b.id}`}>
                                    <Button variant="outline">Open: {b.id}</Button>
                                </Link>
                            ) : (
                                <span className="text-sm text-muted-foreground">
                                    {b.id} — payload not pre-cached yet
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            </section>

            <section>
                <SessionSummaryExport />
            </section>
        </main>
    );
}
