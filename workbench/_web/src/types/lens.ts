import type { Prediction, Token } from "@/types/models";

export enum LensStatistic {
    PROBABILITY = "probability",
    RANK = "rank",
    ENTROPY = "entropy"
}

export interface LensConfigData { 
    model: string;
    statisticType: LensStatistic;
    prompt: string;
    token: Token;
    prediction?: Prediction;
}