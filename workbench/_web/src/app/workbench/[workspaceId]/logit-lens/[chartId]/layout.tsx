import { TooltipProvider } from "@/components/ui/tooltip";

export default function LogitLensChartLayout({ children }: { children: React.ReactNode }) {
    return <TooltipProvider>{children}</TooltipProvider>;
}
