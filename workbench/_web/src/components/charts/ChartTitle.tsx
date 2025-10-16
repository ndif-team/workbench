import { HeatmapChart, LineChart } from "@/db/schema";
import { useUpdateChartName } from "@/lib/api/chartApi";
import { useRef, useState } from "react";

interface ChartTitleProps {
  chart: HeatmapChart | LineChart;
}

export default function ChartTitle({ chart }: ChartTitleProps) {
  const { mutate: updateChartName } = useUpdateChartName();

  const [title, setTitle] = useState(chart.name);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const originalTitleRef = useRef(chart.name);
  const cancelTitleEditRef = useRef(false);

  const handleTitleInputUnfocus = () => {
    if (cancelTitleEditRef.current) {
      cancelTitleEditRef.current = false;
      return;
    }
    const trimmed = title.trim();
    setIsEditingTitle(false);
    if (trimmed.length === 0) {
      setTitle(originalTitleRef.current || chart.name);
      return;
    }
    if (trimmed !== chart.name) {
      setTitle(trimmed);
      originalTitleRef.current = trimmed;
      updateChartName({ chartId: chart.id, name: trimmed });
    }
  };

  if (isEditingTitle) {
    return (
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={handleTitleInputUnfocus}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            cancelTitleEditRef.current = true;
            setTitle(originalTitleRef.current || chart.name);
            setIsEditingTitle(false);
          }
        }}
        placeholder="Untitled Chart"
        className="text-xl font-bold p-0 m-0 border-primary border overflow-clip rounded bg-transparent w-64"
        autoFocus
      />
    );
  } else {
    return (
      <h1
        className="text-xl font-bold cursor-pointer border rounded border-transparent w-64 overflow-clip items-center flex hover:border-border transition-opacity p-0 m-0"
        onClick={() => {
          originalTitleRef.current = title;
          setIsEditingTitle(true);
        }}
      >
        {title || "Untitled Chart"}
      </h1>
    );
  }
}
