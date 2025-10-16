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
}

export function ChartRenameDialog({
  chartId,
  chartName,
  triggerClassName,
}: ChartRenameDialogProps) {
  const { mutate: updateChartName } = useUpdateChartName();

  const [newName, setNewName] = useState(chartName);
  const [open, setOpen] = useState(false);

  const handleSubmit = (e: React.MouseEvent<HTMLButtonElement>) => {
    updateChartName({ chartId, name: newName });
    setOpen(false);
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
        <DialogHeader>
          <DialogTitle>Rename chart</DialogTitle>
        </DialogHeader>
        <Input
          id="name-1"
          name="name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="submit" onClick={handleSubmit}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
