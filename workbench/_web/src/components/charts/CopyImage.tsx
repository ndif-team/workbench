import { useCallback } from "react";
import { useCapture } from "../providers/CaptureProvider";
import { Button } from "../ui/button";
import { Copy } from "lucide-react";

export function CopyImage() {
    const { handleCopyPng } = useCapture();

    const onCopyPng = useCallback(async () => {
        await handleCopyPng();
    }, [handleCopyPng]);

    return (
        <Button variant="outline" size="sm" onClick={onCopyPng}>
            <Copy className="h-4 w-4" />
            <span>Copy Image</span>
        </Button>
    );
}
