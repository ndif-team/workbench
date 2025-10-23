"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { Grid3X3, ChartLine, Trash2, Copy, MoreVertical } from "lucide-react";
import Image from "next/image";
import { ChartMetadata } from "@/types/charts";
import { cn } from "@/lib/utils";
import { ChartRenameDialog } from "./ChartRenameDialog";
import { useCopyChart } from "@/lib/api/chartApi";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";

export type ChartCardProps = {
  metadata: ChartMetadata;
  handleDelete: (e: React.MouseEvent, chartId: string) => void;
  canDelete: boolean;
};

export default function ChartCard({ metadata, handleDelete, canDelete }: ChartCardProps) {
  const { workspaceId, chartId } = useParams<{ workspaceId: string; chartId: string }>();
  const copyChart = useCopyChart();

  const isSelected = chartId === metadata.id;
  const router = useRouter();
  const updatedAt = metadata.updatedAt
    ? new Date(metadata.updatedAt).toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
      })
    : "";

  const navigateToChart = (chartId: string) => {
    router.push(`/workbench/${workspaceId}/${chartId}`);
  };

  const handleChartClick = (metadata: ChartMetadata) => {
    navigateToChart(metadata.id);
  };

  const handleCopy = async (e: React.MouseEvent, chartId: string) => {
    e.stopPropagation();
    try {
      const newChart = await copyChart.mutateAsync(chartId);
      toast.success("Chart copied successfully");
      navigateToChart(newChart.id);
    } catch (error) {
      console.error("Failed to copy chart:", error);
      toast.error("Failed to copy chart");
    }
  };

  const renderChartTypeMini = (chartType: ChartMetadata["chartType"]) => {
    if (chartType === "line")
      return (
        <span className="inline-flex items-center gap-1">
          <ChartLine className="h-3 w-3" />
          <span>Line</span>
        </span>
      );
    if (chartType === "heatmap")
      return (
        <span className="inline-flex items-center gap-1">
          <Grid3X3 className="h-3 w-3" />
          <span>Heatmap</span>
        </span>
      );
    return (
      <span className="inline-flex items-center gap-1 opacity-60">
        <Grid3X3 className="h-3 w-3" />
        <span>unknown</span>
      </span>
    );
  };

  const Thumbnail = () => {
    const style = cn(
      "relative w-[35%] h-24 overflow-hidden rounded-l border-border border-y border-r",
      isSelected && "border-primary",
    );

    const [imageError, setImageError] = React.useState(false);
    const [imageLoaded, setImageLoaded] = React.useState(false);

    const renderPlaceholder = () => (
      <div className="absolute inset-0 z-10 bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-1 text-muted-foreground">
          {metadata.chartType === "line" ? (
            <ChartLine className="h-4 w-4" />
          ) : metadata.chartType === "heatmap" ? (
            <Grid3X3 className="h-4 w-4" />
          ) : (
            <Grid3X3 className="h-4 w-4" />
          )}
          <span className="text-xs font-medium capitalize">{metadata.chartType || "chart"}</span>
        </div>
      </div>
    );

    const showRemoteImage = process.env.NEXT_PUBLIC_LOCAL_DB !== "true";
    if (!showRemoteImage) {
      return <div className={style}>{renderPlaceholder()}</div>;
    }

    const url = `${process.env.NEXT_PUBLIC_THUMBNAILS_BUCKET_URL}/${workspaceId}/${metadata.id}.png`;
    const version = metadata.updatedAt ? new Date(metadata.updatedAt).getTime() : undefined;
    const versionedUrl = version ? `${url}${url.includes("?") ? "&" : "?"}v=${version}` : url;

    return (
      <div className={style}>
        {!imageLoaded && !imageError && renderPlaceholder()}
        <Image
          src={versionedUrl}
          alt="chart thumbnail"
          fill
          sizes="48px"
          style={{ objectFit: "cover", objectPosition: "bottom" }}
          loading="lazy"
          placeholder="empty"
          className="z-0"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageError(true)}
        />
        {imageError && renderPlaceholder()}
      </div>
    );
  };

  return (
    <div
      className={cn(
        // TEMPORARY PROBABLY
        "flex items-center border h-24 rounded",
        isSelected && "border-primary",
      )}
      onClick={() => handleChartClick(metadata)}
      draggable
      onDragStart={(e) => {
        try {
          e.dataTransfer.setData(
            "application/x-chart",
            JSON.stringify({
              chartId: metadata.id,
              chartType: metadata.chartType ?? null,
            }),
          );
          e.dataTransfer.effectAllowed = "copy";
        } catch {}
      }}
    >
      <Thumbnail />
      <div
        key={metadata.id}
        className={cn(
          "p-3 cursor-pointer transition-all h-full w-[65%]",
          isSelected ? "bg-primary/5" : "hover:bg-muted/50",
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-sm font-medium capitalize">
                {/* {formatToolType(metadata.toolType)} */}
                {metadata.name
                  ? metadata.name.length > 16
                    ? `${metadata.name.slice(0, 16)}...`
                    : metadata.name
                  : "Untitled"}
              </span>
            </div>
            <div className="text-xs text-muted-foreground break-words flex items-center gap-3">
              {renderChartTypeMini(metadata.chartType)}
              {updatedAt && renderChartTypeMini(metadata.chartType) && (
                <span className="text-xs text-muted-foreground">•</span>
              )}

              {updatedAt && <span className="text-xs text-muted-foreground">{updatedAt}</span>}
            </div>
          </div>
          <Popover>
            <PopoverTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-40 p-1" align="end">
              <button
                className="flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent rounded-sm"
                onClick={(e) => handleCopy(e, metadata.id)}
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy</span>
              </button>
              <ChartRenameDialog
                chartId={metadata.id}
                chartName={metadata.name || ""}
                triggerClassName="flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent rounded-sm"
              />
              <button
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-sm hover:bg-accent rounded-sm text-destructive ${!canDelete ? "opacity-40 cursor-not-allowed" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(e, metadata.id);
                }}
                disabled={!canDelete}
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Delete</span>
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}
