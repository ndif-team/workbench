import type { Prediction, Token } from "@/types/models";

export enum Metrics {
    PROBABILITY = "probability",
    RANK = "rank",
    ENTROPY = "entropy",
}

export type LensHeatmapMetrics = Metrics;
export type LensLineMetrics = Metrics.PROBABILITY | Metrics.RANK;

export interface LensConfigData {
    model: string;
    statisticType: LensHeatmapMetrics | LensLineMetrics;
    prompt: string;
    token: Token;
    prediction?: Prediction;
}

export interface ConceptLensConfigData {
    model: string;
    prompt: string;
    token: Token;
    prediction?: Prediction;
    statisticType: Metrics; // Concept lens always uses probability
}
