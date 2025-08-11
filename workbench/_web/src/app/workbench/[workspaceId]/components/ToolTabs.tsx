import { usePathname, useRouter, useParams } from "next/navigation";
import { FileText, ReplaceAll, Search } from "lucide-react";
import { useWorkspace } from "@/stores/useWorkspace";
import { useQuery } from "@tanstack/react-query";
import { getConfigForChart } from "@/lib/queries/chartQueries";

const tools = [
    { name: "Lens", key: "lens", icon: <Search className="h-4 w-4" /> },
    { name: "Patch", key: "patch", icon: <ReplaceAll className="h-4 w-4" /> },
];

export function ToolTabs() {
    const pathname = usePathname();
    const router = useRouter();
    const { workspaceId } = useParams<{ workspaceId: string }>();
    const { activeTab } = useWorkspace();

    const { data: config } = useQuery({
        queryKey: ["chartConfig", activeTab],
        queryFn: () => getConfigForChart(activeTab as string),
        enabled: !!activeTab,
    });

    // Determine active tool: prefer config.type when available, else fallback to pathname
    const activeKey = (config?.type as string) || (pathname.includes("/lens") ? "lens" : pathname.includes("/patch") ? "patch" : undefined);
    const activeTool = tools.find(t => t.key === activeKey);

    return (
        <div className="flex items-center justify-between border-b h-12 px-2 py-2">
            <div className="relative group">
                <button className="inline-flex items-center gap-2 px-3 py-1 rounded transition-colors group-hover:bg-muted/50 bg-muted text-foreground">
                    {activeTool?.icon}
                    {activeTool?.name || ""}
                </button>
            </div>
            <div className="flex items-center gap-1">
                <button onClick={() => router.push(`/workbench/${workspaceId}/overview`)} className="flex border rounded items-center gap-2 px-3 py-1 text-foreground transition-colors">
                    <FileText className="h-4 w-4" />
                    Overview
                </button>
                <button onClick={() => router.push(`/workbench/${workspaceId}/summary`)} className="flex border rounded items-center gap-2 px-3 py-1 text-foreground transition-colors">
                    <FileText className="h-4 w-4" />
                    Summary
                </button>
            </div>
        </div>
    )
}