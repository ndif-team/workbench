import { CaptureProvider } from "@/components/providers/CaptureProvider";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function VlmLensChartLayout({ children }: { children: React.ReactNode }) {
    return (
        <TooltipProvider>
            <CaptureProvider>{children}</CaptureProvider>
        </TooltipProvider>
    );
}
