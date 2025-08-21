import { encodeText } from "@/actions/tokenize";
import { Button } from "@/components/ui/button";
import { GitCompareArrows, Route } from "lucide-react";
import { PatchMainMode, PatchSubMode, usePatch } from "./PatchProvider";
import { useWorkspace } from "@/stores/useWorkspace";

const subModesMap: Record<PatchMainMode, PatchSubMode[]> = {
    "edit": [],
    "connect": ["loop", "ablate"],
    "align": ["ablate"],
}

export default function PatchControls() {
    const { selectedModel } = useWorkspace();
    const { sourceText, destText, setSourceTokenData, setDestTokenData, setMainMode, setSubMode, mainMode, subMode } = usePatch();

    if (!selectedModel) {
        return <div>No model selected</div>;
    }

    const handleTokenize = async () => {
        const sourceTokens = await encodeText(sourceText, selectedModel.name);
        const destTokens = await encodeText(destText, selectedModel.name);
        setSourceTokenData(sourceTokens);
        setDestTokenData(destTokens);
        setMainMode("connect");
    };
    
    const activeSubModes = subModesMap[mainMode];

    const toggleSubMode = (sm: PatchSubMode) => {
        if (subMode === sm) {
            setSubMode(null);
        } else {
            setSubMode(sm);
        }
    }

    return (
        <div className="flex items-center gap-3 justify-between w-full">
            {/* Main mode toggles */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-3 border-r pr-3">
                    <Button
                        variant={mainMode === "align" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setMainMode("align")}
                    >
                        <GitCompareArrows /> Align
                    </Button>
                    <Button
                        variant={mainMode === "connect" ? "default" : "outline"}
                        size="sm"
                        onClick={() => setMainMode("connect")}
                    >
                        <Route /> Targeted
                    </Button>
                </div>


                {/* Submode toggles (only for non-edit modes) */}
                {activeSubModes.length > 0 && (
                    <div className="flex items-center gap-3">
                        {activeSubModes.map((sm) => {
                            const isActive = subMode === sm;
                            return (
                                <Button
                                    key={sm}
                                    variant={isActive ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => toggleSubMode(sm)}
                                >
                                    {sm}
                                </Button>
                            );
                        })}
                    </div>
                )}
            </div>
            {/* Tokenize action */}
            <div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        if (mainMode === "edit") {
                            handleTokenize();
                        } else {
                            setMainMode("edit");
                        }
                    }}
                >
                    {mainMode === "edit" ? "Tokenize" : "Edit"}
                </Button>
            </div>
        </div>
    );
}