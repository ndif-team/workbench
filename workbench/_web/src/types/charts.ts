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
    title?: string;
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
    title?: string;
}

export type ChartData = LineGraphData | HeatmapData;
export type ConfigData = LensConfigData | PatchingConfig;