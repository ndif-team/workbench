/**
 * Logit Lens Intro Types
 *
 * Uses the same backend as lens2 but renders with the edulogitlens widget.
 */

import type { LogitLensData } from "nnsightful";

export type LogitLensIntroData = LogitLensData;

export interface LogitLensIntroConfigData {
    model: string;
    prompt: string;
    topk?: number;
    includeEntropy?: boolean;
}
