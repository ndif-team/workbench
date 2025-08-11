import { usePathname, useRouter, useParams } from "next/navigation";
import { FileText, ReplaceAll, Search, Code2, Copy, Check } from "lucide-react";
import { useWorkspace } from "@/stores/useWorkspace";
import { useQuery } from "@tanstack/react-query";
import { getConfigForChart } from "@/lib/queries/chartQueries";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import config from "@/lib/config";

const tools = [
    { name: "Lens", key: "lens", icon: <Search className="h-4 w-4" /> },
    { name: "Patch", key: "patch", icon: <ReplaceAll className="h-4 w-4" /> },
];

export function ToolTabs() {
    const pathname = usePathname();
    const router = useRouter();
    const { workspaceId } = useParams<{ workspaceId: string }>();
    const { activeTab } = useWorkspace();

    const { data: configData } = useQuery({
        queryKey: ["chartConfig", activeTab],
        queryFn: () => getConfigForChart(activeTab as string),
        enabled: !!activeTab,
    });

    // Determine active tool: prefer config.type when available, else fallback to pathname
    const activeKey = (configData?.type as string) || (pathname.includes("/lens") ? "lens" : pathname.includes("/patch") ? "patch" : undefined);
    const activeTool = tools.find(t => t.key === activeKey);

    const [isExportOpen, setIsExportOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const pythonCode = useMemo(() => {
        if (!configData || configData.type !== "lens") return "";
        const d = configData.data as any;
        const backendUrl = config.backendUrl;

        const gridPayload = {
            model: d.model,
            prompt: d.prompt,
        };

        const token = d.token || {};
        const hasLine = Array.isArray(token.targetIds) && token.targetIds.length > 0;

        const linePayload = hasLine
            ? {
                model: d.model,
                prompt: d.prompt,
                token: {
                    idx: token.idx ?? 0,
                    id: token.id ?? 0,
                    text: token.text ?? "",
                    targetIds: token.targetIds ?? [],
                },
            }
            : null;

        const codeLines: string[] = [];
        codeLines.push(
`import os, json, requests

BACKEND_URL = os.environ.get("BACKEND_URL", ${JSON.stringify(backendUrl)})


def start_job(endpoint: str, payload: dict):
    resp = requests.post(f"{BACKEND_URL}{endpoint}", json=payload)
    resp.raise_for_status()
    job_id = resp.json()["job_id"]
    listen_endpoint = endpoint.replace("get-", "listen-")
    with requests.get(f"{BACKEND_URL}{listen_endpoint}/{job_id}", stream=True) as r:
        r.raise_for_status()
        for raw in r.iter_lines(decode_unicode=True):
            if not raw:
                continue
            line = raw.strip()
            if line == "data: [DONE]":
                break
            if line.startswith("data: "):
                data = json.loads(line[len("data: "):])
                if data.get("type") == "status":
                    print("Status:", data.get("message"))
                elif data.get("type") == "result":
                    return data.get("data")
                elif data.get("type") == "error":
                    raise RuntimeError(data.get("message"))
    raise RuntimeError("No result received from server")
`);

        codeLines.push(`# Grid lens request (heatmap)
GRID_PAYLOAD = ${JSON.stringify(gridPayload, null, 2)}
GRID_RESULT = start_job("/lens/get-grid", GRID_PAYLOAD)
print("Grid result:")
print(json.dumps(GRID_RESULT, indent=2))
`);

        if (linePayload) {
            codeLines.push(`# Line lens request
LINE_PAYLOAD = ${JSON.stringify(linePayload, null, 2)}
LINE_RESULT = start_job("/lens/get-line", LINE_PAYLOAD)
print("Line result:")
print(json.dumps(LINE_RESULT, indent=2))
`);
        } else {
            codeLines.push(`# Line lens request (enable by selecting predictions to populate token.targetIds)`);
            codeLines.push(`# LINE_PAYLOAD = { ... }  # see app to populate token.targetIds`);
        }

        return codeLines.join("\n");
    }, [configData]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(pythonCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (e) {
            console.error("Failed to copy:", e);
        }
    };

    return (
        <div className="flex items-center justify-between border-b h-12 px-2 py-2">
            <div className="relative group">
                <button className="inline-flex items-center gap-2 px-3 py-1 rounded transition-colors group-hover:bg-muted/50 bg-muted text-foreground">
                    {activeTool?.icon}
                    {activeTool?.name || ""}
                </button>
            </div>
            <div className="flex items-center gap-1">
                {configData?.type === "lens" && (
                    <button
                        onClick={() => setIsExportOpen(true)}
                        className="flex border rounded items-center gap-2 px-3 py-1 text-foreground transition-colors"
                        title="Export code"
                    >
                        <Code2 className="h-4 w-4" />
                        Export
                    </button>
                )}
                <button onClick={() => router.push(`/workbench/${workspaceId}/overview`)} className="flex border rounded items-center gap-2 px-3 py-1 text-foreground transition-colors">
                    <FileText className="h-4 w-4" />
                    Overview
                </button>
            </div>

            {configData?.type === "lens" && (
                <Dialog open={isExportOpen} onOpenChange={setIsExportOpen}>
                    <DialogContent className="top-0 left-0 translate-x-0 translate-y-0 w-screen h-screen max-w-none rounded-none p-0">
                        <DialogHeader className="border-b">
                            <div className="flex items-center justify-between px-4 py-3">
                                <DialogTitle>Export Lens code</DialogTitle>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleCopy}
                                        className="inline-flex items-center gap-2 border rounded px-3 py-1"
                                        title="Copy code"
                                    >
                                        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                        {copied ? "Copied" : "Copy"}
                                    </button>
                                </div>
                            </div>
                        </DialogHeader>
                        <div className="h-[calc(100%-3rem)] w-full overflow-auto">
                            <pre className="w-full h-full p-4 text-sm bg-background">
<code className="whitespace-pre-wrap">{pythonCode}</code>
                            </pre>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    )
}