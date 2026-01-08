import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Pencil } from "lucide-react";
import { useUpdateChartName } from "@/lib/api/chartApi";
import { useState } from "react";

interface ChartRenameDialogProps {
    chartId: string;
    chartName: string;
    triggerClassName?: string;
    onSuccess?: () => void;
}

export function ChartRenameDialog({
    chartId,
    chartName,
    triggerClassName,
    onSuccess,
}: ChartRenameDialogProps) {
    const { mutate: updateChartName } = useUpdateChartName();

    const [newName, setNewName] = useState(chartName);
    const [open, setOpen] = useState(false);

    const handleSubmit = () => {
        updateChartName({ chartId, name: newName });
        setOpen(false);
        onSuccess?.();
    };

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSubmit();
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <button
                    className={triggerClassName || `p-1 rounded hover:bg-muted`}
                    aria-label="Rename chart"
                >
                    <Pencil className="h-3.5 w-3.5" />
                    {triggerClassName && <span>Rename</span>}
                </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[325px]">
                <form onSubmit={handleFormSubmit}>
                    <DialogHeader>
                        <DialogTitle>Rename chart</DialogTitle>
                    </DialogHeader>
                    <Input
                        id="name-1"
                        name="name"
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        className="my-4"
                        autoFocus
                    />
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button type="submit">
                            Save changes
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
