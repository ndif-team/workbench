import { HeatmapView, LineView, View } from "@/db/schema"
import { createContext, ReactNode, useCallback, useContext } from "react"
import { ChartType, ChartView } from "@/types/charts"
import { useDebouncedCallback } from "use-debounce"
import { useCreateView, useUpdateView } from "@/lib/api/viewApi"
import { getView } from "@/lib/queries/viewQueries"
import { useQuery } from "@tanstack/react-query"
import { queryKeys } from "@/lib/queryKeys"

interface ViewContextValue {
    view: View | null
    chartType: ChartType | null
    isViewSuccess: boolean
    persistView: (view: ChartView) => void
    cancelPersistView: () => void
}

const ViewContext = createContext<ViewContextValue | null>(null)

export const useHeatmapView = () => {
    const ctx = useContext(ViewContext)
    if (!ctx) throw new Error("useHeatmapView must be used within a ViewProvider")
    return { ...ctx, view: ctx.view as HeatmapView | null }
}

export const useLineView = () => {
    const ctx = useContext(ViewContext)
    if (!ctx) throw new Error("useLineView must be used within a ViewProvider")
    return { ...ctx, view: ctx.view as LineView | null }
}

interface ViewProviderProps {
    chartId: string
    children: ReactNode
}

export const ViewProvider = ({ chartId, children }: ViewProviderProps) => {

    const { mutateAsync: updateView } = useUpdateView()
    const { mutateAsync: createView } = useCreateView()

    const { data, isSuccess: isViewSuccess } = useQuery<{view: View, chartType: ChartType} | null>({
        queryKey: queryKeys.views.byChart(chartId),
        queryFn: () => getView(chartId),
        enabled: !!chartId,
    })
    const view: View | null = data?.view ?? null
    const chartType: ChartType | null = data?.chartType ?? null

    const _persistView = useDebouncedCallback(async (viewData: ChartView) => {
        // Skip if query is not ready yet
        if (!isViewSuccess) return

        if (view) {
            await updateView({ id: view.id, chartId: chartId, data: viewData })
        } else {
            await createView({ chartId: chartId, data: viewData })
        }
    }, 3000)

    const persistView = useCallback((viewData: ChartView) => {
        if (_persistView.isPending()) _persistView.cancel()
        _persistView(viewData)
    }, [_persistView])

    const cancelPersistView = useCallback(() => {
        _persistView.cancel()
    }, [_persistView])

    const contextValue: ViewContextValue = {
        view,
        chartType,
        isViewSuccess,
        persistView,
        cancelPersistView,
    }

    return <ViewContext.Provider value={contextValue}>{children}</ViewContext.Provider>
}