import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { StorybookHeatmapCard } from "./StorybookHeatmapCard";
import { Metrics } from "@/types/lens";
import {
    mockSmallChart,
    mockMediumChart,
    mockLargeChart,
    mockRankChart,
    mockEntropyChart,
    mockEmptyChart,
    mockChartWithTopTokens,
} from "./mockData";

const meta: Meta<typeof StorybookHeatmapCard> = {
    title: "Charts/Heatmap/Interactive",
    component: StorybookHeatmapCard,
    parameters: {
        layout: "padded",
        docs: {
            description: {
                component:
                    "Interactive HeatmapCard with full provider setup. Sample data shows Logit Lens output for 'Eiffel Tower is located in the city of'. Uses mock providers for Storybook - no backend required.",
            },
        },
    },
    tags: ["autodocs"],
    decorators: [
        (Story) => (
            <div className="w-full h-[600px] bg-card rounded-lg border shadow-sm">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        chart: {
            control: false,
            description: "HeatmapChart data object",
        },
        statisticType: {
            control: "select",
            options: [Metrics.PROBABILITY, Metrics.RANK, Metrics.ENTROPY],
            description: "Type of metric being displayed",
        },
        pending: {
            control: "boolean",
            description: "Show loading/pending state",
        },
        initialViewData: {
            control: false,
            description: "Initial view state (zoom bounds, selection, etc.)",
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Eiffel Tower Logit Lens - "Eiffel Tower is located in the city of"
 * Shows how model predictions evolve across layers.
 */
export const EiffelTower: Story = {
    args: {
        chart: mockChartWithTopTokens,
        statisticType: Metrics.PROBABILITY,
        pending: false,
    },
    parameters: {
        docs: {
            description: {
                story:
                    "Real Logit Lens data for 'Eiffel Tower is located in the city of'. Watch how later layers (16+) confidently predict 'Paris'. Click and drag to select cells, use the crop button to zoom.",
            },
        },
    },
};

/**
 * Large heatmap for testing performance with many cells.
 */
export const LargeDataset: Story = {
    args: {
        chart: mockLargeChart,
        statisticType: Metrics.PROBABILITY,
        pending: false,
    },
    decorators: [
        (Story) => (
            <div className="w-full h-[800px] bg-card rounded-lg border shadow-sm">
                <Story />
            </div>
        ),
    ],
    parameters: {
        docs: {
            description: {
                story:
                    "Large heatmap (30x48) to test rendering and interaction performance with many cells.",
            },
        },
    },
};

/**
 * Heatmap showing rank metric with logarithmic scale.
 */
export const RankMetric: Story = {
    args: {
        chart: mockRankChart,
        statisticType: Metrics.RANK,
        pending: false,
    },
    parameters: {
        docs: {
            description: {
                story:
                    "Heatmap displaying rank values (log scale). Notice the right axis shows predicted tokens.",
            },
        },
    },
};

/**
 * Heatmap showing entropy metric.
 */
export const EntropyMetric: Story = {
    args: {
        chart: mockEntropyChart,
        statisticType: Metrics.ENTROPY,
        pending: false,
    },
    parameters: {
        docs: {
            description: {
                story:
                    "Heatmap displaying entropy values (bits). Lower entropy = more confident predictions.",
            },
        },
    },
};

/**
 * Loading/pending state with shimmer animation.
 */
export const Pending: Story = {
    args: {
        chart: mockMediumChart,
        statisticType: Metrics.PROBABILITY,
        pending: true,
    },
    parameters: {
        docs: {
            description: {
                story:
                    "Loading state shown while chart data is being fetched. Features a shimmer animation overlay.",
            },
        },
    },
};

/**
 * Empty heatmap state.
 */
export const Empty: Story = {
    args: {
        chart: mockEmptyChart,
        statisticType: Metrics.PROBABILITY,
        pending: false,
    },
    parameters: {
        docs: {
            description: {
                story: "Empty heatmap state when no data is available.",
            },
        },
    },
};

/**
 * Heatmap with pre-defined selection annotation.
 */
export const WithSelection: Story = {
    args: {
        chart: mockMediumChart,
        statisticType: Metrics.PROBABILITY,
        pending: false,
        initialViewData: {
            annotation: {
                minRow: 2,
                maxRow: 5,
                minCol: 5,
                maxCol: 12,
            },
            xStep: 2,
        },
    },
    parameters: {
        docs: {
            description: {
                story:
                    "Heatmap with a pre-defined selection region. Use the crop button to zoom into the selection.",
            },
        },
    },
};

/**
 * Heatmap with custom zoom bounds.
 */
export const Zoomed: Story = {
    args: {
        chart: mockLargeChart,
        statisticType: Metrics.PROBABILITY,
        pending: false,
        initialViewData: {
            bounds: {
                minRow: 10,
                maxRow: 20,
                minCol: 15,
                maxCol: 35,
            },
            xStep: 1,
        },
    },
    parameters: {
        docs: {
            description: {
                story:
                    "Heatmap with initial zoom applied. Click the reset button to return to full view.",
            },
        },
    },
};

/**
 * Dark mode variant - use the theme toggle in Storybook toolbar.
 */
export const DarkMode: Story = {
    args: {
        chart: mockMediumChart,
        statisticType: Metrics.PROBABILITY,
        pending: false,
    },
    globals: {
        theme: "dark",
    },
    parameters: {
        docs: {
            description: {
                story:
                    "Heatmap in dark mode. Toggle the theme in the Storybook toolbar to compare light/dark modes.",
            },
        },
    },
};

/**
 * Heatmap with enhanced token popover showing top N tokens and their probabilities.
 * Hover over any cell to see the probability distribution for that layer/position.
 */
export const WithTokenPopover: Story = {
    args: {
        chart: mockChartWithTopTokens,
        statisticType: Metrics.PROBABILITY,
        pending: false,
    },
    parameters: {
        docs: {
            description: {
                story:
                    "Enhanced heatmap with token popover. Hover over any cell to see a sleek popover displaying the top 10 tokens and their probabilities as horizontal bars. The popover uses the same blues color scheme as the main heatmap and automatically positions itself to avoid going off-screen.",
            },
        },
    },
};

