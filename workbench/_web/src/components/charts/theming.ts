const fontFamily =
  'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", "Liberation Sans", sans-serif';

const baseTheme = {
  background: "transparent",
  text: {
    fontSize: 11,
    fontFamily: fontFamily,
    fill: "hsl(var(--foreground))",
    outlineColor: "transparent",
  },
  axis: {
    domain: {
      line: {
        stroke: "transparent",
        strokeWidth: 0,
      },
    },
    ticks: {
      line: {
        stroke: "hsl(var(--border))",
        strokeWidth: 1,
      },
      text: {
        fontSize: ".75rem",
        fontFamily: fontFamily,
        fill: "hsl(var(--muted-foreground))",
        outlineColor: "transparent",
      },
    },
  },
  legends: {
    text: {
      fontSize: 11,
      fontFamily: fontFamily,
      fill: "hsl(var(--foreground))",
      outlineColor: "transparent",
    },
    ticks: {
      line: {},
      text: {
        fontSize: 10,
        fontFamily: fontFamily,
        fill: "hsl(var(--foreground))",
        outlineColor: "transparent",
      },
    },
  },
  grid: {
    line: {
      stroke: "hsl(var(--border))",
      strokeWidth: 1,
      strokeOpacity: 0.3,
    },
  },
  tooltip: {
    wrapper: {},
    container: {
      background: "hsl(var(--popover))",
      color: "hsl(var(--popover-foreground))",
      fontSize: 10,
      fontFamily: fontFamily,
      borderRadius: "calc(var(--radius) - 2px)",
      boxShadow: "var(--shadow-lg)",
      padding: "5px 5px",
    },
  },
};

export const heatmapMargin = { top: 50, right: 100, bottom: 90, left: 60 };
export const lineMargin = { top: 15, right: 30, bottom: 70, left: 75 };

export const lineTheme = baseTheme;

export const heatmapTheme = {
  ...baseTheme,
  labels: {
    text: {
      fontSize: 10,
      fontFamily: fontFamily,
      outlineColor: "transparent",
    },
  },
};

// Line color palette (Set1-like)
export const lineColors = [
  "#e41a1c", // red
  "#377eb8", // blue
  "#4daf4a", // green
  "#984ea3", // purple
  "#ff7f00", // orange
  "#ffff33", // yellow
  "#a65628", // brown
  "#f781bf", // pink
  "#999999", // gray
];
