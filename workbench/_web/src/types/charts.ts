import { LensConfigData } from "./lens";
import { PatchingConfig } from "./patching";

export interface HeatmapCell {
    x: string | number;
    y: number | null;
    label?: string;
}

export interface HeatmapRow {
    id: string;
    data: HeatmapCell[];
}

export interface HeatmapHighlight {
    x: number;
    y: number;
}

export interface HeatmapData {
    rows: HeatmapRow[];
    highlights?: HeatmapHighlight[];
}

export interface Position {
    x: number;
    y: number;
}

export interface Line {
    id: string;
    data: Position[];
}

export interface LineGraphData {
    lines: Line[];
}

export type ChartData = LineGraphData | HeatmapData;
export type ConfigData = LensConfigData | PatchingConfig;

// Shared chart/type metadata used across UI and queries
export type ChartType = "line" | "heatmap";
export type ToolType = "lens" | "patch";

export type BasicChart = {
    id: string;
    name: string | null;
    type: ChartType | null;
};

export type BasicChartWithTool = {
    id: string;
    name: string | null;
    chartType: ChartType | null;
    toolType: ToolType | null;
};

export type ToolTypedChart = {
    id: string;
    chartType: ChartType | null;
    toolType: ToolType | null;
    createdAt: Date;
    annotationCount: number;
    thumbnailUrl?: string | null;
};