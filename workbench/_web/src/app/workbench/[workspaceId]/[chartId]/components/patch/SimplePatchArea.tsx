import { Textarea } from "@/components/ui/textarea";
import PatchControls from "./PatchControls";
import PatchProvider, { usePatch } from "./PatchProvider";
import { TokenArea } from "./TokenArea";
import { useWorkspace } from "@/stores/useWorkspace";
import ConnectionsProvider from "./ConnectionsProvider";

export default function SimplePatchArea() {
    return (
        <PatchProvider>
            <SimplePatchContent />
        </PatchProvider>
    );
}

const SimplePatchContent = () => {
    const { selectedModel } = useWorkspace();
    const { sourceText, destText, setSourceText, setDestText, mainMode } = usePatch();

    if (!selectedModel) {
        return <div>No model selected</div>;
    }

    return (
        <div className="flex flex-col p-3 gap-3">
            <PatchControls />

            {mainMode === "edit" ? (
                <div className="flex flex-col gap-3">
                    <Textarea
                        value={sourceText}
                        onChange={(e) => setSourceText(e.target.value)}
                        className="h-48"
                        placeholder="Source"
                    />
                    <Textarea
                        value={destText}
                        onChange={(e) => setDestText(e.target.value)}
                        className="h-48"
                        placeholder="Destination"
                    />
                </div>
            ) : (
                <ConnectionsProvider>
                    <div className="flex flex-col gap-3">
                        <div className="border rounded py-2 px-3 h-48">
                            <TokenArea side="source" />
                        </div>
                        <div className="border rounded py-2 px-3 h-48">
                            <TokenArea side="destination" />
                        </div>
                    </div>
                </ConnectionsProvider>
            )}
        </div>
    );
};
