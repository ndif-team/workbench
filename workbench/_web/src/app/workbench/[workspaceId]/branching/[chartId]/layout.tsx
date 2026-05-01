import { TooltipProvider } from "@/components/ui/tooltip";

export default function BranchingChartLayout({ children }: { children: React.ReactNode }) {
    return <TooltipProvider>{children}</TooltipProvider>;
}
