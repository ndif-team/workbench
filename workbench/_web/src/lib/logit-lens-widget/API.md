# LogitLens Widget JavaScript API

The LogitLens widget is a **self-contained, zero-dependency** JavaScript visualization for exploring how transformer language models build predictions across layers. It renders as pure HTML/CSS/SVG—no React, no D3, no build tools required.

**Design philosophy:**
- **Works anywhere**: Jupyter notebooks, static HTML pages, web apps
- **No installation**: Just include the script and call `LogitLensWidget()`
- **Interactive by default**: Click, hover, drag, pin tokens—all built in
- **Linkable widgets**: Compare models side-by-side with synchronized sizing

The widget works as a standalone IIFE (Immediately Invoked Function Expression) that can be loaded from a CDN or local file—no module bundlers required.

## Loading the Widget

### From CDN (jsDelivr)

```html
<script src="https://cdn.jsdelivr.net/gh/davidbau/workbench@main/workbench/logitlens/static/logit-lens-widget.min.js"></script>
```

### From Local File

```html
<script src="logit-lens-widget.min.js"></script>
```

### From npm (for bundlers)

```bash
npm install interp-workbench
```

```javascript
import { LogitLensWidget } from 'interp-workbench/widget';
```

## Quick Start

The widget creates a global `LogitLensWidget` function when loaded via script tag:

```html
<!DOCTYPE html>
<html>
<head>
  <title>LogitLens Demo</title>
</head>
<body>
  <div id="widget-container" style="max-width: 800px;"></div>

  <!-- Load the widget -->
  <script src="https://cdn.jsdelivr.net/gh/davidbau/workbench@main/workbench/logitlens/static/logit-lens-widget.min.js"></script>

  <script>
    // Data from collect_logit_lens() converted with to_js_format()
    const data = {
      input: ["The", " capital", " of", " France", " is"],
      layers: [0, 1, 2, 3, 4, 5],
      topk: /* ... */,
      tracked: /* ... */
    };

    // Create the widget
    const widget = LogitLensWidget('#widget-container', data, {
      title: "GPT-2: Capital Prediction",
      darkMode: false
    });

    // Interact programmatically
    widget.setDarkMode(true);
    widget.togglePinnedTrajectory(" Paris");
  </script>
</body>
</html>
```

### Generating Data from Python

Use the `workbench.logitlens` module to generate widget data:

```python
from nnsight import LanguageModel
from workbench.logitlens import collect_logit_lens, to_js_format
import json

model = LanguageModel("openai-community/gpt2")
data = collect_logit_lens("The capital of France is", model, k=5)
js_data = to_js_format(data)

# Save for use in HTML
with open("widget_data.json", "w") as f:
    json.dump(js_data, f)
```

Then load in your HTML:

```html
<script>
  fetch('widget_data.json')
    .then(r => r.json())
    .then(data => {
      LogitLensWidget('#container', data);
    });
</script>
```

## Constructor

### `LogitLensWidget(container, data, options?)`

Creates a new widget instance.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `container` | `string \| Element` | CSS selector or DOM element to render into |
| `data` | `WidgetInputData` | Logit lens data (V1 or V2 format) |
| `options` | `UIState` | Optional initial UI state |

**Returns:** `LogitLensWidgetInterface | undefined`

Returns the widget interface object, or `undefined` if the container was not found.

**Example:**

```javascript
// Using CSS selector
const widget = LogitLensWidget('#my-container', data);

// Using DOM element
const widget = LogitLensWidget(document.getElementById('my-container'), data);

// With initial options
const widget = LogitLensWidget('#container', data, {
  darkMode: true,
  chartHeight: 200,
  title: "My Analysis"
});
```

---

## Data Formats

The widget accepts two data formats. Both are produced by the Python `collect_logit_lens()` function.

### V2 Format (Recommended)

The compact format optimized for bandwidth. This is what `to_js_format()` produces from Python.

```typescript
interface V2InputData {
  meta?: { model?: string; version?: number };
  input: string[];           // Input tokens: ["The", " capital", " of", ...]
  layers: number[];          // Layer indices: [0, 1, 2, ..., 31]
  topk: string[][][];        // Top-k tokens: [layer][position][k]
  tracked: Record<string, number[] | TrackedTrajectory>[];  // Per-position trajectories
  entropy?: number[][];      // Optional entropy values: [layer][position]
}
```

### V1 Format (Legacy)

The expanded format with pre-computed cell data.

```typescript
interface V1InputData {
  layers: number[];
  tokens?: string[];         // Alias for input
  input?: string[];
  cells: CellData[][];       // [position][layer]
  meta?: { model?: string; version?: number };
}
```

---

## Initial Options (UIState)

Pass these options as the third argument to customize initial appearance and behavior.

### Layout Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chartHeight` | `number \| null` | `null` | Height of trajectory chart in pixels. `null` uses auto-sizing based on content font size. |
| `inputTokenWidth` | `number` | `100` | Width of the input token column in pixels. |
| `cellWidth` | `number` | `44` | Width of each layer column in pixels. |
| `maxRows` | `number \| null` | `null` | Maximum visible layer rows. `null` shows all layers. Useful for very deep models. |
| `maxTableWidth` | `number \| null` | `null` | Maximum width of the heatmap table. `null` allows natural sizing. |

### Display Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `title` | `string` | `"Logit Lens..."` | Widget title displayed at the top. |
| `darkMode` | `boolean \| null` | `null` | Dark mode setting. `null` auto-detects from page styles. `true` forces dark mode. `false` forces light mode. |
| `showHeatmap` | `boolean` | `true` | Whether to show the heatmap table. |
| `showChart` | `boolean` | `true` | Whether to show the trajectory chart. |

### Chart Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `plotMinLayer` | `number` | `0` | First layer to include in trajectory chart. Early layers often show random predictions; setting this to 2-4 can improve chart clarity. |
| `trajectoryMetric` | `"probability" \| "rank"` | `"probability"` | Y-axis metric for trajectory lines. "probability" shows 0-100%, "rank" shows vocabulary rank (lower is better). |
| `colorModes` | `string[]` | `["top", <final_token>]` | Heatmap coloring modes. See Color Modes section. |
| `heatmapBaseColor` | `string \| null` | `null` | Custom color for "top" mode (default purple). |
| `heatmapNextColor` | `string \| null` | `null` | Custom color for token-specific mode (default orange). |

### Pinned State

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pinnedGroups` | `PinnedGroup[]` | `[]` | Pre-pinned trajectory groups. Each group has `tokens`, `color`, and optional `lineStyle`. |
| `pinnedRows` | `SerializedPinnedRow[]` | `[]` | Pre-selected input token rows. Each has `pos` (position index) and `line` (style name). |

**Example with options:**

```javascript
const widget = LogitLensWidget('#container', data, {
  title: "Llama-3.1-8B: Capital Prediction",
  darkMode: true,
  chartHeight: 180,
  plotMinLayer: 4,
  trajectoryMetric: "probability",
  colorModes: ["top", " Paris"],
  pinnedRows: [{ pos: 4, line: "solid" }]  // Pin position 4
});
```

---

## Methods

### State Management

#### `getState(): UIState`

Returns the complete current UI state. Use this to serialize widget state for later restoration.

```javascript
const state = widget.getState();
localStorage.setItem('widgetState', JSON.stringify(state));

// Later, restore:
const saved = JSON.parse(localStorage.getItem('widgetState'));
const widget = LogitLensWidget('#container', data, saved);
```

#### `getColumnState(): ColumnState`

Returns layout dimensions for column synchronization between widgets.

```javascript
const colState = widget.getColumnState();
// { cellWidth: 44, inputTokenWidth: 100, maxTableWidth: null }
```

#### `setColumnState(state, fromSync?): void`

Sets column dimensions. Used internally for widget linking.

---

### Title

#### `setTitle(title: string): void`

Updates the widget title. Users can also double-click the title to edit it interactively.

```javascript
widget.setTitle("Layer-by-layer prediction for: The capital of France is");
```

#### `getTitle(): string`

Returns the current title.

---

### Dark Mode

#### `setDarkMode(enabled: boolean | null): void`

Controls dark mode appearance.

- `true`: Force dark mode
- `false`: Force light mode
- `null`: Auto-detect from page (checks `prefers-color-scheme` and parent element backgrounds)

```javascript
widget.setDarkMode(true);   // Force dark
widget.setDarkMode(null);   // Auto-detect
```

#### `getDarkMode(): boolean`

Returns whether dark mode is currently active (after auto-detection if applicable).

---

### Font Size

#### `setFontSize(options: { title?: string; content?: string } | null): void`

Customizes font sizes using CSS units.

```javascript
widget.setFontSize({ title: "16px", content: "12px" });
widget.setFontSize(null);  // Reset to defaults
```

#### `getFontSize(): { title: string; content: string }`

Returns current font sizes.

---

### Trajectory Metric

The trajectory chart can show either probability (0-100%) or rank (position in vocabulary when sorted by probability).

#### `setTrajectoryMetric(metric: "probability" | "rank"): void`

Switches the Y-axis metric. Rank mode requires rank data in the input (from `include_rank=True` in Python).

```javascript
widget.setTrajectoryMetric("rank");  // Show vocabulary rank
widget.setTrajectoryMetric("probability");  // Show percentage
```

#### `getTrajectoryMetric(): "probability" | "rank"`

Returns the current metric.

#### `hasRankData(): boolean`

Returns whether rank data is available. If false, `setTrajectoryMetric("rank")` will be ignored.

---

### Color Modes (Heatmap)

The heatmap can be colored by multiple modes simultaneously, cycling through them with the (c) button.

**Available modes:**
- `"top"`: Color by probability of the top-k prediction (default purple gradient)
- `"entropy"`: Color by entropy at each position/layer (requires entropy data)
- `"<token>"`: Color by probability of a specific token (e.g., `" Paris"`)
- Empty array `[]`: No coloring (grayscale)

#### `setColorModes(modes: string[]): void`

Sets the color mode cycle.

```javascript
widget.setColorModes(["top"]);                    // Only top-k coloring
widget.setColorModes(["top", " Paris", " London"]); // Cycle through these
widget.setColorModes([]);                         // No coloring
```

#### `getColorModes(): string[]`

Returns the current color modes array.

#### `addColorMode(mode: string): void`

Adds a mode to the cycle (if not already present).

```javascript
widget.addColorMode(" Berlin");  // Add Berlin to the cycle
```

#### `removeColorMode(mode: string): void`

Removes a mode from the cycle.

#### `hasEntropyData(): boolean`

Returns whether entropy data is available for the `"entropy"` color mode.

---

### Visibility

#### `setShowHeatmap(show: boolean): void`

Shows or hides the heatmap table.

#### `getShowHeatmap(): boolean`

Returns whether the heatmap is visible.

#### `setShowChart(show: boolean): void`

Shows or hides the trajectory chart.

#### `getShowChart(): boolean`

Returns whether the chart is visible.

---

### Pinned Rows

Pinned rows highlight specific input token positions, showing their trajectory in the chart.

#### `togglePinnedRow(pos: number): boolean`

Toggles whether an input position is pinned. Returns `true` if now pinned, `false` if unpinned.

```javascript
widget.togglePinnedRow(4);  // Toggle position 4 (5th token)
```

#### `getPinnedRows(): SerializedPinnedRow[]`

Returns array of pinned rows with position and line style.

```javascript
const rows = widget.getPinnedRows();
// [{ pos: 4, line: "solid" }, { pos: 2, line: "dashed" }]
```

---

### Pinned Trajectories

Pinned trajectories show specific tokens' probability paths across layers.

#### `togglePinnedTrajectory(token: string, addToGroup?: boolean): boolean`

Toggles a token trajectory.

- `addToGroup=false` (default): Creates a new group or removes if already pinned
- `addToGroup=true`: Adds to the most recent group (shares color/style)

```javascript
widget.togglePinnedTrajectory(" Paris");           // New group
widget.togglePinnedTrajectory(" France", true);    // Add to same group
```

#### `getPinnedGroups(): PinnedGroup[]`

Returns all pinned trajectory groups.

```javascript
const groups = widget.getPinnedGroups();
// [{ tokens: [" Paris", " France"], color: "#2196F3", lineStyle: { name: "solid", dash: "" } }]
```

---

### Hover Synchronization

For coordinating hover state with external components (e.g., React wrappers).

#### `hoverRow(pos: number): void`

Programmatically hovers over a row, highlighting it and showing its trajectory.

```javascript
widget.hoverRow(3);  // Hover the 4th input token
```

#### `clearHover(): void`

Clears the hover state.

#### `getHoveredRow(): number`

Returns the currently hovered row index.

---

### Widget Linking

Link multiple widgets to synchronize their column layouts.

#### `linkColumnsTo(otherWidget: LogitLensWidgetInterface): void`

Links this widget's column sizes to another widget. Changes propagate bidirectionally.

```javascript
const widget1 = LogitLensWidget('#container1', data1);
const widget2 = LogitLensWidget('#container2', data2);
widget1.linkColumnsTo(widget2);  // Now they resize together
```

#### `unlinkColumns(otherWidget: LogitLensWidgetInterface): void`

Removes the link between widgets.

---

### Events

Subscribe to widget state changes for reactive integrations.

#### `on(event, listener): void`

Subscribes to an event.

```javascript
widget.on('hover', (pos) => {
  console.log('Hovering position:', pos);
});

widget.on('title', (newTitle) => {
  console.log('Title changed to:', newTitle);
});
```

#### `off(event, listener): void`

Unsubscribes from an event.

**Available events:**

| Event | Value Type | Description |
|-------|------------|-------------|
| `hover` | `number \| null` | Hovered row position (transient, not persisted) |
| `title` | `string` | Title changed |
| `darkMode` | `boolean \| null` | Dark mode setting changed |
| `chartHeight` | `number \| null` | Chart height changed |
| `cellWidth` | `number` | Cell width changed |
| `inputTokenWidth` | `number` | Input column width changed |
| `maxRows` | `number \| null` | Max visible rows changed |
| `maxTableWidth` | `number \| null` | Table width changed |
| `plotMinLayer` | `number` | Chart start layer changed |
| `colorModes` | `string[]` | Color modes changed |
| `colorIndex` | `number` | Active color mode index changed |
| `trajectoryMetric` | `"probability" \| "rank"` | Metric changed |
| `pinnedRows` | `SerializedPinnedRow[]` | Pinned rows changed |
| `pinnedGroups` | `PinnedGroup[]` | Pinned trajectories changed |
| `showHeatmap` | `boolean` | Heatmap visibility changed |
| `showChart` | `boolean` | Chart visibility changed |

---

## Interactive Features

The widget provides rich interactivity without requiring any additional code. Users can explore the data through clicking, hovering, and dragging gestures.

### Table Gestures

The main table responds to various mouse interactions. Clicking cells opens detailed popups, clicking input tokens pins rows for comparison, and dragging borders resizes columns.

| Gesture | Target | Effect |
|---------|--------|--------|
| **Click** | Prediction cell | Open popup with top-k predictions |
| **Click** | Input token | Pin/unpin row for comparison |
| **Click** | Title text | Edit title inline |
| **Click** | "(colored by X)" | Open color mode menu |
| **Hover** | Prediction cell | Show trajectory preview (gray dotted) |
| **Hover** | Input token row | Highlight row |
| **Drag** | Column border | Resize column width |
| **Drag** | Input column border | Resize input column |
| **Drag** | Table right edge | Adjust max table width |
| **Drag** | Table bottom edge | Limit visible rows |
| **Drag** | Chart x-axis | Resize chart height |

### Popup Interactions

When you click a prediction cell, a popup appears showing all top-k predictions at that layer and position. The popup allows you to pin tokens for trajectory tracking.

| Gesture | Effect |
|---------|--------|
| **Click** token | Pin/unpin token trajectory (new group) |
| **Shift+Click** token | Add/remove from last active group |
| **Click** X button | Close popup |
| **Click** outside | Close popup |

### Token Pinning

Token pinning is the primary way to compare how different tokens' probabilities evolve across layers. When you click a token in the popup, it becomes "pinned" and its trajectory remains visible in the chart even after closing the popup. Pinned tokens are organized into colored groups, and the chart shows the sum of probabilities for all tokens in each group.

- First pin creates a new colored group
- Shift+click adds tokens to existing group
- Similar tokens show grouping hints
- Pinned tokens' probabilities sum in trajectory

### Row Pinning

Row pinning allows you to compare trajectories across different input positions. When you click an input token in the leftmost column, that row becomes pinned and its trajectory appears in the chart with a distinct line style (solid, dashed, or dotted). This lets you see how the model's predictions differ for different parts of the input.

- Each pinned row uses a different line style (solid, dashed, dotted)
- Yellow background indicates pinned rows
- Multiple rows can be pinned for side-by-side comparison

### Title Bar Controls

- **Double-click title**: Edit title inline
- **(c) button**: Cycle through color modes
- **(m) button**: Toggle probability/rank metric (if rank data available)

### Layer Stride

Large models like Llama-70B have 80 layers, which cannot all be displayed as columns without making each column too narrow to read. The widget automatically computes a "stride" to show evenly-spaced layers that fit the available width. As you resize columns, the stride adjusts dynamically.

1. Computes how many columns fit given cell width and container
2. Shows evenly-spaced layers (e.g., "showing every 4 layers")
3. Dragging column borders adjusts stride dynamically

---

## CSS Custom Properties

Customize appearance with CSS variables on the widget container:

```css
#my-widget {
  --ll-title-size: 16px;
  --ll-content-size: 12px;
}
```

---

## TypeScript Support

Full TypeScript definitions are available. Import types from the module:

```typescript
import type {
  LogitLensWidgetInterface,
  UIState,
  WidgetInputData,
  V2InputData,
  PinnedGroup,
  TrajectoryMetric
} from './logit-lens-widget/types';
```

---

## Browser Compatibility

The widget uses modern CSS and JavaScript features:

- CSS `:has()` selector (Chrome 105+, Safari 15.4+, Firefox 121+)
- ES6 template literals
- SVG support

All major browsers released since late 2023 are supported.

---

## CSS Scoping

Each widget instance generates a unique ID (like `ll_interact_0`, `ll_interact_1`, etc.) and injects CSS rules scoped to that ID. This ensures that multiple widgets on the same page remain completely independent—styling one widget does not affect others, and their interactive states are isolated.

---

## Complete Examples

### Basic Usage

```javascript
var widget = LogitLensWidget("#viz", data);
```

### Custom Initial State

```javascript
var widget = LogitLensWidget("#viz", data, {
    title: "GPT-2: The quick brown fox",
    cellWidth: 50,
    chartHeight: 200,
    colorModes: ["top"]
});
```

### Pre-Pin Specific Rows

```javascript
var widget = LogitLensWidget("#viz", data, {
    title: "Comparing subject vs. verb",
    pinnedRows: [
        { pos: 1, line: "solid" },    // "cat" - the subject
        { pos: 3, line: "dashed" }    // "sat" - the verb
    ]
});
```

### Save and Restore State

```javascript
// Save
var state = widget.getState();
localStorage.setItem('widget', JSON.stringify(state));

// Restore
var saved = JSON.parse(localStorage.getItem('widget'));
var widget = LogitLensWidget("#viz", data, saved);
```

### Linked Widgets for Comparison

```javascript
var widget1 = LogitLensWidget("#viz1", data1, { title: "Llama 8B" });
var widget2 = LogitLensWidget("#viz2", data2, { title: "Llama 70B" });

// Resize either widget and both update
widget1.linkColumnsTo(widget2);

// Later, unlink
widget1.unlinkColumns(widget2);
```

### Duplicate Widget with State

```javascript
var widget1 = LogitLensWidget("#viz1", data);
// ... user interacts, changes settings ...

// Create identical copy with same pinned tokens, column widths, etc.
var widget2 = LogitLensWidget("#viz2", data, widget1.getState());
```

### React Integration with Events

```javascript
const widget = LogitLensWidget('#container', data);

widget.on('hover', (pos) => {
  // Sync with React state
  setHoveredPosition(pos);
});

widget.on('pinnedGroups', (groups) => {
  // Sync pinned tokens with React
  setPinnedTokens(groups.flatMap(g => g.tokens));
});
```
