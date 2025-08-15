import { intersectAll } from "drizzle-orm/pg-core";
import { LensConfigData } from "./lens";
import { PatchingConfig } from "./patching";

export interface TokenProb {
    id: string;
    prob: number;
}

export interface HeatmapCell {
    x: string | number;
    y: number | null;
    data: TokenProb[];
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

export type ChartType = "line" | "heatmap";
export type ToolType = "lens" | "patch";

export type ChartMetadata = {
    id: string;
    name: string | null;
    chartType: ChartType | null;
    toolType: ToolType | null;
    updatedAt: Date;
    thumbnailUrl?: string | null;
};