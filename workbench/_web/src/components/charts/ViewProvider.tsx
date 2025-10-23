import { HeatmapView, LineView, View } from "@/db/schema";
import { createContext, ReactNode, useCallback, useContext, useMemo, useRef } from "react";
import { ChartType, ChartView, HeatmapBounds, SelectionBounds } from "@/types/charts";
import { useDebouncedCallback } from "use-debounce";
import { useCreateView, useDeleteView, useUpdateView } from "@/lib/api/viewApi";
import { getView } from "@/lib/queries/viewQueries";
import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useCapture } from "../providers/CaptureProvider";

interface ViewContextValue {
  view: View | null;
  chartType: ChartType | null;
  isViewSuccess: boolean;
  cancelPersistView: () => void;
  persistView: (viewData: Partial<ChartView>) => void;
  clearView: () => Promise<void>;
}

const ViewContext = createContext<ViewContextValue | null>(null);

export const useHeatmapView = () => {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error("useHeatmapView must be used within a ViewProvider");
  return { ...ctx, view: ctx.view as HeatmapView | null };
};

export const useLineView = () => {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error("useLineView must be used within a ViewProvider");
  return { ...ctx, view: ctx.view as LineView | null };
};

interface ViewProviderProps {
  chartId: string;
  children: ReactNode;
}

export const ViewProvider = ({ chartId, children }: ViewProviderProps) => {
  const { captureChartThumbnail } = useCapture();

  const { mutateAsync: updateView } = useUpdateView();
  const { mutateAsync: createView } = useCreateView();
  const { mutateAsync: deleteView } = useDeleteView();

  const { data, isSuccess: isViewSuccess } = useQuery<{
    view: View;
    chartType: ChartType;
  } | null>({
    queryKey: queryKeys.views.byChart(chartId),
    queryFn: () => getView(chartId),
    enabled: !!chartId,
  });
  const view: View | null = data?.view ?? null;
  const chartType: ChartType | null = data?.chartType ?? null;

  const pendingRef = useRef<ChartView | null>(null);

  const _persistView = useDebouncedCallback(async (viewData: ChartView) => {
    // Skip if query is not ready yet
    if (!isViewSuccess) return;

    if (view) {
      await updateView({ id: view.id, chartId: chartId, data: viewData });
    } else {
      await createView({ chartId: chartId, data: viewData });
    }
    // Clear pending after successful persist
    pendingRef.current = null;
    await captureChartThumbnail(chartId);
  }, 1500);

  const persistView = useCallback(
    (viewData: Partial<ChartView>) => {
      const base = pendingRef.current ?? (view?.data as ChartView | null) ?? {};
      const merged = { ...base, ...viewData } as ChartView;
      pendingRef.current = merged;
      _persistView(merged);
    },
    [_persistView, view],
  );

  const cancelPersistView = useCallback(() => {
    _persistView.cancel();
    pendingRef.current = null;
  }, [_persistView]);

  const clearView = useCallback(async () => {
    cancelPersistView();
    if (view) {
      await deleteView({ id: view.id, chartId: chartId });
    }
  }, [view, chartId, deleteView, cancelPersistView]);

  const contextValue: ViewContextValue = {
    view,
    chartType,
    isViewSuccess,
    cancelPersistView,
    persistView,
    clearView,
  };

  return <ViewContext.Provider value={contextValue}>{children}</ViewContext.Provider>;
};
