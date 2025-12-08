import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { Heatmap } from "../Heatmap";
import { Metrics } from "@/types/lens";
import {
    eiffelTowerData,
    largeHeatmapData,
    rankHeatmapData,
    entropyHeatmapData,
} from "./mockData";

// Storybook-optimized margin with room for axis labels
const storybookMargin = { top: 10, right: 90, bottom: 60, left: 70 };

const meta: Meta<typeof Heatmap> = {
    title: "Charts/Heatmap/Standalone",
    component: Heatmap,
    parameters: {
        layout: "padded",
        docs: {
            description: {
                component:
                    "The core Heatmap visualization component using @nivo/heatmap. This standalone version shows the raw chart without interactive providers. Sample data shows Logit Lens output for 'Eiffel Tower is located in the city of'.",
            },
        },
    },
    tags: ["autodocs"],
    decorators: [
        (Story) => (
            <div className="w-full h-[500px] bg-card rounded-lg border p-4">
                <Story />
            </div>
        ),
    ],
    argTypes: {
        rows: {
            control: false,
            description: "Array of HeatmapRow data to display",
        },
        statisticType: {
            control: "select",
            options: [Metrics.PROBABILITY, Metrics.RANK, Metrics.ENTROPY],
            description: "Type of metric being displayed",
        },
        useTooltip: {
            control: "boolean",
            description: "Whether to show tooltip on hover (requires providers)",
        },
    },
};

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Eiffel Tower Logit Lens - "Eiffel Tower is located in the city of"
 * Shows how model predictions evolve across layers from prompt tokens to "Paris"
 */
export const EiffelTower: Story = {
    args: {
        rows: eiffelTowerData,
        statisticType: Metrics.PROBABILITY,
        useTooltip: false,
        margin: { top: 10, right: 90, bottom: 70, left: 80 },
    },
    parameters: {
        docs: {
            description: {
                story:
                    "Real Logit Lens data showing predictions for 'Eiffel Tower is located in the city of'. Watch how later layers (16+) confidently predict 'Paris' with high probability.",
            },
        },
    },
};

/**
 * Large heatmap for performance testing (30x48 grid)
 */
export const Large: Story = {
    args: {
        rows: largeHeatmapData,
        statisticType: Metrics.PROBABILITY,
        useTooltip: false,
    },
    decorators: [
        (Story) => (
            <div className="w-full h-[700px] bg-card rounded-lg border p-4">
                <Story />
            </div>
        ),
    ],
    parameters: {
        docs: {
            description: {
                story:
                    "A large heatmap (30x48) to test rendering performance with many cells.",
            },
        },
    },
};

/**
 * Heatmap displaying rank metric with right axis labels
 */
export const WithRankMetric: Story = {
    args: {
        rows: rankHeatmapData,
        statisticType: Metrics.RANK,
        useTooltip: false,
    },
    parameters: {
        docs: {
            description: {
                story:
                    "Heatmap showing rank values (log scale). Notice the right axis labels showing predicted tokens.",
            },
        },
    },
};

/**
 * Heatmap displaying entropy metric with right axis labels
 */
export const WithEntropyMetric: Story = {
    args: {
        rows: entropyHeatmapData,
        statisticType: Metrics.ENTROPY,
        useTooltip: false,
    },
    parameters: {
        docs: {
            description: {
                story:
                    "Heatmap showing entropy values (bits). Lower entropy indicates more confident predictions.",
            },
        },
    },
};

/**
 * Empty heatmap state
 */
export const Empty: Story = {
    args: {
        rows: [],
        statisticType: Metrics.PROBABILITY,
        useTooltip: false,
    },
    parameters: {
        docs: {
            description: {
                story: "Empty heatmap showing the component's behavior with no data.",
            },
        },
    },
};

/**
 * Custom margins example
 */
export const CustomMargins: Story = {
    args: {
        rows: eiffelTowerData,
        statisticType: Metrics.PROBABILITY,
        useTooltip: false,
        margin: { top: 20, right: 120, bottom: 60, left: 80 },
    },
    parameters: {
        docs: {
            description: {
                story: "Heatmap with custom margins for different layout requirements.",
            },
        },
    },
};

