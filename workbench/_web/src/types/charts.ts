import { LensConfigData } from "./lens";
import { Lens2ConfigData, Lens2Data } from "./lens2";
import { PatchingConfig } from "./patching";
import { ActivationPatchingConfigData, ActivationPatchingData } from "./activationPatching";

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

export type ChartData = Line[] | HeatmapRow[] | Lens2Data | ActivationPatchingData;
export type ChartView = HeatmapViewData | LineViewData;
export type ConfigData = LensConfigData | Lens2ConfigData | PatchingConfig | ActivationPatchingConfigData;

export type ChartType = "line" | "heatmap" | "lens2" | "activation-patching";
export type ToolType = "lens" | "lens2" | "patch" | "activation-patching";

export type ChartMetadata = {
    id: string;
    name: string | null;
    chartType: ChartType | null;
    toolType: ToolType | null;
    createdAt: Date;
    updatedAt: Date;
    thumbnailUrl?: string | null;
};
