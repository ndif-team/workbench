import { LensConfigData } from "./lens";
import { PatchingConfig } from "./patching";

// Heatmap Data Types

export interface HeatmapCell {
    x: string | number;
    y: number | null;
    label?: string;
}

export interface HeatmapRow {
    id: string;
    data: HeatmapCell[];
    right_axis_label?: string;
}

// Heatmap View Types

export interface HeatmapBounds {
    minRow: number;
    maxRow: number;
    minCol: number;
    maxCol: number;
}

export interface HeatmapViewData {
    bounds?: HeatmapBounds;
    xStep?: number;
    annotation?: HeatmapBounds;
}

export type Range = [number, number];

// Line Data Types

export interface Position {
    x: number;
    y: number;
}

export interface Line {
    id: string;
    data: Position[];
}

// Line View Types

export interface SelectionBounds {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
}

export interface LineViewData {
    bounds?: SelectionBounds;
    selectedLineIds?: string[];
    annotation?: SelectionBounds;
}

// Combined Types

export type ChartData = Line[] | HeatmapRow[];
export type ChartView = HeatmapViewData | LineViewData;
export type ConfigData = LensConfigData | PatchingConfig;

export type ChartType = "line" | "heatmap";
export type ToolType = "lens" | "patch";

export type ChartMetadata = {
    id: string;
    name: string | null;
    chartType: ChartType | null;
    toolType: ToolType | null;
    createdAt: Date;
    updatedAt: Date;
    thumbnailUrl?: string | null;
};
