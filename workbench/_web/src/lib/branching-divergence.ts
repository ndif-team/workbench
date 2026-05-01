import type { TopKLogit, BranchingSample } from "@/types/workshop";

/**
 * Compute a per-position divergence score across N samples. The score is the
 * KL divergence of each sample's top-K distribution at position p from the
 * position-wise mean distribution. We average across samples to get a single
 * "how different are these samples here" scalar in [0, ∞).
 *
 * Returns an array of length max-position-across-samples; positions beyond a
 * sample's completion are skipped in its contribution.
 */
export function computeDivergenceByPosition(samples: BranchingSample[]): number[] {
    if (samples.length < 2) return [];
    const maxLen = Math.max(...samples.map((s) => s.per_position_top_k.length));
    const out: number[] = [];

    for (let pos = 0; pos < maxLen; pos++) {
        // Build a unioned top-K distribution per sample at this position.
        const dists: Map<number, number>[] = [];
        for (const s of samples) {
            const row = s.per_position_top_k[pos];
            const m = new Map<number, number>();
            if (row) for (const e of row) m.set(e.token_id, e.probability);
            dists.push(m);
        }

        const allIds = new Set<number>();
        for (const m of dists) for (const id of m.keys()) allIds.add(id);
        if (allIds.size === 0) {
            out.push(0);
            continue;
        }

        // mean distribution
        const mean = new Map<number, number>();
        for (const id of allIds) {
            let s = 0;
            for (const m of dists) s += m.get(id) ?? 0;
            mean.set(id, s / dists.length);
        }

        // average KL(p_i || mean) across samples
        let sumKL = 0;
        for (const m of dists) {
            let kl = 0;
            for (const id of allIds) {
                const p = m.get(id) ?? 0;
                const q = mean.get(id) ?? 1e-9;
                if (p > 0 && q > 0) kl += p * Math.log(p / q);
            }
            sumKL += kl;
        }
        out.push(sumKL / dists.length);
    }
    return out;
}

/**
 * Position-wise plurality token id across samples — used to highlight tokens
 * that *differ* from the majority at a given position.
 */
export function pluralityTokenAtPosition(samples: BranchingSample[], pos: number): number | null {
    const counts = new Map<number, number>();
    for (const s of samples) {
        const t = s.completion_tokens[pos];
        if (!t) continue;
        counts.set(t.id, (counts.get(t.id) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    let bestId = -1;
    let bestN = -1;
    for (const [id, n] of counts) {
        if (n > bestN) {
            bestN = n;
            bestId = id;
        }
    }
    return bestId;
}

/** Map a divergence score to an opacity in [0, 1]. */
export function divergenceToSaturation(score: number): number {
    if (score <= 0) return 0;
    return Math.min(1, score / 1.5);
}

/** Convenience: get top-5 alternatives at a position from a sample. */
export function topKAtPosition(sample: BranchingSample, pos: number): TopKLogit[] {
    return sample.per_position_top_k[pos] ?? [];
}
