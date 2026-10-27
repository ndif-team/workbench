import { TooltipProvider } from "@/components/ui/tooltip";

export default function ActivationPatchingLayout({ children }: { children: React.ReactNode }) {
    return <TooltipProvider>{children}</TooltipProvider>;
}
