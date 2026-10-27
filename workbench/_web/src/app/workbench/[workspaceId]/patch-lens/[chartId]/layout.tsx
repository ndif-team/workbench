import { TooltipProvider } from "@/components/ui/tooltip";

export default function PatchLensChartLayout({ children }: { children: React.ReactNode }) {
    return <TooltipProvider>{children}</TooltipProvider>;
}
