import { HeatmapRow, HeatmapCell } from "@/types/charts";

/**
 * Mock HeatmapChart type for Storybook (avoids db schema dependency)
 */
export interface MockHeatmapChart {
    id: string;
    name: string;
    type: "heatmap";
    data: HeatmapRow[];
    workspaceId: string;
    createdAt: Date;
    updatedAt: Date;
    thumbnailUrl: string | null;
}

/**
 * Real Logit Lens sample data - "Eiffel Tower is located in the city of"
 * This matches the actual output format from the NDIF API
 */
export const eiffelTowerData: HeatmapRow[] = [
    {
        id: "E",
        data: [
            { x: 0, y: 0.15, label: "ighty" },
            { x: 2, y: 0.72, label: "ighty" },
            { x: 4, y: 0.45, label: "ighty" },
            { x: 6, y: 0.22, label: "AF" },
            { x: 8, y: 0.35, label: "ighth" },
            { x: 10, y: 0.28, label: "igen" },
            { x: 12, y: 0.55, label: "fficient" },
            { x: 14, y: 0.62, label: "fficient" },
            { x: 16, y: 0.78, label: "ffic" },
            { x: 18, y: 0.75, label: "ffic" },
            { x: 20, y: 0.72, label: "ffic" },
            { x: 22, y: 0.70, label: "ffic" },
            { x: 24, y: 0.68, label: "ffic" },
            { x: 26, y: 0.12, label: "-" },
        ],
    },
    {
        id: "iff",
        data: [
            { x: 0, y: 0.18, label: "usion" },
            { x: 2, y: 0.65, label: "usion" },
            { x: 4, y: 0.42, label: "enberg" },
            { x: 6, y: 0.25, label: "el" },
            { x: 8, y: 0.48, label: "enberg" },
            { x: 10, y: 0.52, label: "enberg" },
            { x: 12, y: 0.85, label: "el" },
            { x: 14, y: 0.88, label: "el" },
            { x: 16, y: 0.92, label: "el" },
            { x: 18, y: 0.90, label: "el" },
            { x: 20, y: 0.88, label: "el" },
            { x: 22, y: 0.86, label: "el" },
            { x: 24, y: 0.84, label: "el" },
            { x: 26, y: 0.82, label: "el" },
        ],
    },
    {
        id: "el",
        data: [
            { x: 0, y: 0.12, label: "ogs" },
            { x: 2, y: 0.22, label: "og" },
            { x: 4, y: 0.75, label: "Tower" },
            { x: 6, y: 0.82, label: "Tower" },
            { x: 8, y: 0.85, label: "Tower" },
            { x: 10, y: 0.88, label: "Tower" },
            { x: 12, y: 0.90, label: "Tower" },
            { x: 14, y: 0.92, label: "Tower" },
            { x: 16, y: 0.95, label: "Tower" },
            { x: 18, y: 0.94, label: "Tower" },
            { x: 20, y: 0.93, label: "Tower" },
            { x: 22, y: 0.95, label: "Tower" },
            { x: 24, y: 0.96, label: "Tower" },
            { x: 26, y: 0.94, label: "Tower" },
        ],
    },
    {
        id: "Tower",
        data: [
            { x: 0, y: 0.25, label: "ing" },
            { x: 2, y: 0.35, label: "ism" },
            { x: 4, y: 0.32, label: "ing" },
            { x: 6, y: 0.28, label: "fr" },
            { x: 8, y: 0.30, label: "fr" },
            { x: 10, y: 0.38, label: "isk" },
            { x: 12, y: 0.72, label: "Paris" },
            { x: 14, y: 0.78, label: "lights" },
            { x: 16, y: 0.75, label: "lights" },
            { x: 18, y: 0.72, label: "lights" },
            { x: 20, y: 0.68, label: "stands" },
            { x: 22, y: 0.65, label: "stands" },
            { x: 24, y: 0.55, label: "is" },
            { x: 26, y: 0.58, label: "is" },
        ],
    },
    {
        id: "is",
        data: [
            { x: 0, y: 0.22, label: "still" },
            { x: 2, y: 0.42, label: "also" },
            { x: 4, y: 0.38, label: "also" },
            { x: 6, y: 0.45, label: "often" },
            { x: 8, y: 0.48, label: "often" },
            { x: 10, y: 0.52, label: "often" },
            { x: 12, y: 0.65, label: "located" },
            { x: 14, y: 0.78, label: "iconic" },
            { x: 16, y: 0.82, label: "iconic" },
            { x: 18, y: 0.88, label: "iconic" },
            { x: 20, y: 0.85, label: "iconic" },
            { x: 22, y: 0.82, label: "iconic" },
            { x: 24, y: 0.58, label: "one" },
            { x: 26, y: 0.55, label: "one" },
        ],
    },
    {
        id: "located",
        data: [
            { x: 0, y: 0.18, label: "enc" },
            { x: 2, y: 0.35, label: "near" },
            { x: 4, y: 0.42, label: "in" },
            { x: 6, y: 0.45, label: "in" },
            { x: 8, y: 0.52, label: "north" },
            { x: 10, y: 0.55, label: "north" },
            { x: 12, y: 0.62, label: "south" },
            { x: 14, y: 0.65, label: "south" },
            { x: 16, y: 0.75, label: "near" },
            { x: 18, y: 0.78, label: "near" },
            { x: 20, y: 0.76, label: "near" },
            { x: 22, y: 0.74, label: "near" },
            { x: 24, y: 0.72, label: "near" },
            { x: 26, y: 0.45, label: "in" },
        ],
    },
    {
        id: "in",
        data: [
            { x: 0, y: 0.15, label: "vitro" },
            { x: 2, y: 0.28, label: "front" },
            { x: 4, y: 0.68, label: "France" },
            { x: 6, y: 0.72, label: "France" },
            { x: 8, y: 0.45, label: "German" },
            { x: 10, y: 0.42, label: "Germany" },
            { x: 12, y: 0.75, label: "France" },
            { x: 14, y: 0.88, label: "Paris" },
            { x: 16, y: 0.92, label: "Paris" },
            { x: 18, y: 0.90, label: "Paris" },
            { x: 20, y: 0.88, label: "Paris" },
            { x: 22, y: 0.86, label: "Paris" },
            { x: 24, y: 0.84, label: "Paris" },
            { x: 26, y: 0.35, label: "the" },
        ],
    },
    {
        id: "the",
        data: [
            { x: 0, y: 0.12, label: "latter" },
            { x: 2, y: 0.58, label: "midst" },
            { x: 4, y: 0.72, label: "midst" },
            { x: 6, y: 0.75, label: "midst" },
            { x: 8, y: 0.72, label: "midst" },
            { x: 10, y: 0.68, label: "midst" },
            { x: 12, y: 0.55, label: "center" },
            { x: 14, y: 0.62, label: "city" },
            { x: 16, y: 0.85, label: "Paris" },
            { x: 18, y: 0.92, label: "Paris" },
            { x: 20, y: 0.95, label: "Paris" },
            { x: 22, y: 0.96, label: "Paris" },
            { x: 24, y: 0.94, label: "Paris" },
            { x: 26, y: 0.42, label: "heart" },
        ],
    },
    {
        id: "city",
        data: [
            { x: 0, y: 0.18, label: "scape" },
            { x: 2, y: 0.35, label: "scape" },
            { x: 4, y: 0.52, label: "centre" },
            { x: 6, y: 0.55, label: "scape" },
            { x: 8, y: 0.48, label: "centre" },
            { x: 10, y: 0.45, label: "centre" },
            { x: 12, y: 0.42, label: "centre" },
            { x: 14, y: 0.55, label: "centre" },
            { x: 16, y: 0.58, label: "centre" },
            { x: 18, y: 0.55, label: "centre" },
            { x: 20, y: 0.82, label: "Paris" },
            { x: 22, y: 0.78, label: "center" },
            { x: 24, y: 0.32, label: "of" },
            { x: 26, y: 0.28, label: "of" },
        ],
    },
    {
        id: "of",
        data: [
            { x: 0, y: 0.08, label: "Fort" },
            { x: 2, y: 0.22, label: "South" },
            { x: 4, y: 0.45, label: "Berlin" },
            { x: 6, y: 0.42, label: "Virginia" },
            { x: 8, y: 0.48, label: "London" },
            { x: 10, y: 0.52, label: "Washingt" },
            { x: 12, y: 0.78, label: "Paris" },
            { x: 14, y: 0.88, label: "Paris" },
            { x: 16, y: 0.92, label: "Paris" },
            { x: 18, y: 0.94, label: "Paris" },
            { x: 20, y: 0.95, label: "Paris" },
            { x: 22, y: 0.96, label: "Paris" },
            { x: 24, y: 0.97, label: "Paris" },
            { x: 26, y: 0.98, label: "Paris" },
        ],
    },
];

/**
 * Generate mock heatmap data matching Logit Lens output format
 */
export function generateHeatmapData(
    numRows: number,
    numCols: number,
    options: {
        includeLabels?: boolean;
        includeRightAxisLabel?: boolean;
        valueRange?: [number, number];
    } = {}
): HeatmapRow[] {
    const {
        includeLabels = false,
        includeRightAxisLabel = false,
        valueRange = [0, 1],
    } = options;

    const tokens = [
        "The", "quick", "brown", "fox", "jumps", "over", "the", "lazy", "dog",
        "Hello", "world", "!", "How", "are", "you", "?", "I", "am", "fine",
        "thanks", "for", "asking", ".", "Let", "me", "tell", "you", "about",
        "neural", "networks", "and", "transformers", ".", "They", "are",
        "fascinating", "!", "GPT", "models", "use", "attention", "mechanisms",
    ];

    const rows: HeatmapRow[] = [];

    for (let row = 0; row < numRows; row++) {
        const tokenLabel = tokens[row % tokens.length];
        const cells: HeatmapCell[] = [];

        for (let col = 0; col < numCols; col++) {
            // Generate realistic probability-like values
            // Create some patterns to make it visually interesting
            const baseValue = Math.random();
            const patternValue =
                Math.sin((row * 0.3) + (col * 0.2)) * 0.3 +
                Math.cos((row * 0.1) - (col * 0.15)) * 0.2;
            const normalizedValue = Math.max(
                valueRange[0],
                Math.min(valueRange[1], baseValue * 0.5 + patternValue + 0.3)
            );

            const cell: HeatmapCell = {
                x: col,
                y: normalizedValue,
            };

            if (includeLabels && normalizedValue > 0.7) {
                cell.label = tokenLabel.slice(0, 3);
            }

            cells.push(cell);
        }

        const heatmapRow: HeatmapRow = {
            id: `${tokenLabel}-${row}`,
            data: cells,
        };

        if (includeRightAxisLabel) {
            // Simulate top prediction token for rank/entropy metrics
            const predictions = ["▁the", "▁a", "▁is", "▁to", "▁in", "▁and", "▁of"];
            heatmapRow.right_axis_label = predictions[row % predictions.length];
        }

        rows.push(heatmapRow);
    }

    return rows;
}

/**
 * Generate rank-based heatmap data (log scale values)
 */
export function generateRankData(numRows: number, numCols: number): HeatmapRow[] {
    const tokens = [
        "The", "quick", "brown", "fox", "jumps", "over", "the", "lazy", "dog",
        "Hello", "world",
    ];

    const rows: HeatmapRow[] = [];

    for (let row = 0; row < numRows; row++) {
        const tokenLabel = tokens[row % tokens.length];
        const cells: HeatmapCell[] = [];

        for (let col = 0; col < numCols; col++) {
            // Rank values typically range from 0 to log(vocab_size)
            // Generate values that show interesting patterns
            const baseRank = Math.random() * 5 + Math.random() * 3;
            const layerEffect = (col / numCols) * 2; // Ranks tend to decrease in later layers
            const rankValue = Math.max(0, baseRank - layerEffect);

            cells.push({
                x: col,
                y: rankValue,
            });
        }

        rows.push({
            id: `${tokenLabel}-${row}`,
            data: cells,
            right_axis_label: tokens[(row + 1) % tokens.length],
        });
    }

    return rows;
}

/**
 * Generate entropy-based heatmap data
 */
export function generateEntropyData(numRows: number, numCols: number): HeatmapRow[] {
    const tokens = [
        "The", "quick", "brown", "fox", "jumps", "over", "the", "lazy", "dog",
        "Hello", "world",
    ];

    const rows: HeatmapRow[] = [];

    for (let row = 0; row < numRows; row++) {
        const tokenLabel = tokens[row % tokens.length];
        const cells: HeatmapCell[] = [];

        for (let col = 0; col < numCols; col++) {
            // Entropy values typically range from 0 to ~10 (bits)
            // Lower entropy = more confident predictions
            const baseEntropy = Math.random() * 8;
            const layerEffect = (col / numCols) * 3; // Entropy tends to decrease in later layers
            const entropyValue = Math.max(0, baseEntropy - layerEffect);

            cells.push({
                x: col,
                y: entropyValue,
            });
        }

        rows.push({
            id: `${tokenLabel}-${row}`,
            data: cells,
            right_axis_label: tokens[(row + 1) % tokens.length],
        });
    }

    return rows;
}

// Pre-generated datasets for stories - using the real Eiffel Tower data as default
export const smallHeatmapData = eiffelTowerData;
export const mediumHeatmapData = eiffelTowerData;
export const largeHeatmapData = generateHeatmapData(30, 48, { includeLabels: false });

export const rankHeatmapData = generateRankData(10, 20);
export const entropyHeatmapData = generateEntropyData(10, 20);

/**
 * Create a mock HeatmapChart object
 */
export function createMockHeatmapChart(
    data: HeatmapRow[],
    overrides: Partial<MockHeatmapChart> = {}
): MockHeatmapChart {
    return {
        id: overrides.id ?? "mock-chart-1",
        name: overrides.name ?? "Mock Heatmap",
        type: "heatmap",
        data,
        workspaceId: overrides.workspaceId ?? "mock-workspace-1",
        createdAt: overrides.createdAt ?? new Date(),
        updatedAt: overrides.updatedAt ?? new Date(),
        thumbnailUrl: overrides.thumbnailUrl ?? null,
    };
}

// Pre-made chart objects for stories - using Eiffel Tower data
export const mockSmallChart = createMockHeatmapChart(eiffelTowerData, {
    id: "eiffel-tower-chart",
    name: "Eiffel Tower Logit Lens",
});

export const mockMediumChart = createMockHeatmapChart(eiffelTowerData, {
    id: "eiffel-tower-chart",
    name: "Eiffel Tower Logit Lens",
});

export const mockLargeChart = createMockHeatmapChart(largeHeatmapData, {
    id: "large-chart",
    name: "Large Heatmap (30x48)",
});

export const mockRankChart = createMockHeatmapChart(rankHeatmapData, {
    id: "rank-chart",
    name: "Rank Heatmap",
});

export const mockEntropyChart = createMockHeatmapChart(entropyHeatmapData, {
    id: "entropy-chart",
    name: "Entropy Heatmap",
});

export const mockEmptyChart = createMockHeatmapChart([], {
    id: "empty-chart",
    name: "Empty Heatmap",
});
