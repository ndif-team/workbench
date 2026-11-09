import { Button } from "@/components/ui/button";
import { PageHeader } from "../../components/shell/PageHeader";

/** What `/new` shows when it couldn't create its chart or chat: `message` and Try again. */
export function LaunchFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="flex size-full min-h-0 flex-col">
            <PageHeader />
            <div className="flex flex-1 items-center justify-center p-4" role="alert">
                <div className="flex flex-col items-center gap-3 text-center">
                    <p className="text-sm text-muted-foreground">{message}</p>
                    <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                        Try again
                    </Button>
                </div>
            </div>
        </div>
    );
}
