import type { Token, Prediction } from "@/types/models";
import { Metrics } from "@/types/lens";

export interface ActivationPatchingConfigData {
    model: string;
    srcPrompt: string;
    tgtPrompt: string;
    srcPosition: number;
    tgtPosition: number;
    metric: Metrics;
    targetIds?: number[];
    srcTokens?: Token[];
    tgtTokens?: Token[];
    prediction?: Prediction; // Store merged predictions for dropdown options
}


