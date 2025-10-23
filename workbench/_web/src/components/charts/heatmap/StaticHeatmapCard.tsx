import { Heatmap } from "./Heatmap";
import { HeatmapDataProvider, useHeatmapData } from "./HeatmapDataProvider";
import { HeatmapChart } from "@/db/schema";
import { HeatmapCanvasProvider, useHeatmapCanvas } from "./HeatmapCanvasProvider";
import { HeatmapHoverProvider, useHeatmapHover } from "./HeatmapHoverProvider";
import { useAnnotationSelection } from "./useAnnotationSelection";
import { ViewProvider } from "../ViewProvider";
import { Metrics } from "@/types/lens";

interface StaticHeatmapCardProps {
  chart: HeatmapChart;
  statisticType?: Metrics;
}

export const StaticHeatmapCard = ({ chart, statisticType }: StaticHeatmapCardProps) => {
  return (
    <div className="h-full rounded bg-card">
      <ViewProvider chartId={chart.id}>
        <HeatmapDataProvider chart={chart}>
          <HeatmapCanvasProvider>
            <HeatmapHoverProvider>
              <StaticHeatmap statisticType={statisticType} />
            </HeatmapHoverProvider>
          </HeatmapCanvasProvider>
        </HeatmapDataProvider>
      </ViewProvider>
    </div>
  );
};

const StaticHeatmap = ({ statisticType }: { statisticType?: Metrics }) => {
  const { filteredData: data } = useHeatmapData();
  const { heatmapCanvasRef } = useHeatmapCanvas();
  const { handleMouseMove, handleMouseLeave } = useHeatmapHover();
  useAnnotationSelection();

  return (
    <Heatmap
      rows={data}
      heatmapCanvasRef={heatmapCanvasRef}
      useTooltip={true}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      statisticType={statisticType}
    />
  );
};
