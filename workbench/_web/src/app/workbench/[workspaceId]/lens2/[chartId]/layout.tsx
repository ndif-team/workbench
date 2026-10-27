import { TooltipProvider } from "@/components/ui/tooltip";

export default function Lens2ChartLayout({ children }: { children: React.ReactNode }) {
    return <TooltipProvider>{children}</TooltipProvider>;
}
