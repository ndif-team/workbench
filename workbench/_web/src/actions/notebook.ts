"use server";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// ── Charts.js singleton ──────────────────────────────────────────────

let _chartsJs: string | null = null;

async function getChartsJs(): Promise<string> {
    if (!_chartsJs) {
        // process.cwd() is the project root in both local dev and Vercel.
        // The file is included in Vercel builds via outputFileTracingIncludes.
        const chartsPath = join(
            process.cwd(),
            "node_modules/nnsightful/src/nnsightful/viz/charts.js",
        );
        _chartsJs = await readFile(chartsPath, "utf-8");
    }
    return _chartsJs;
}

// ── Template reading (cached) ────────────────────────────────────────

interface NotebookCell {
    cell_type: "code" | "markdown";
    source: string | string[];
    metadata: Record<string, unknown>;
    outputs?: Record<string, unknown>[];
    execution_count?: number | null;
}

interface NotebookJson {
    nbformat: number;
    nbformat_minor: number;
    metadata: Record<string, unknown>;
    cells: NotebookCell[];
}

/** Normalize cell source (string | string[]) → string. */
function normalizeSource(source: string | string[]): string {
    return Array.isArray(source) ? source.join("") : source;
}

// Template cache — templates are static files, safe to read once.
const _templates = new Map<string, NotebookJson>();

async function readTemplate(name: string): Promise<NotebookJson> {
    if (!_templates.has(name)) {
        // process.cwd() is the project root in both local dev and Vercel.
        // Templates are included in Vercel builds via outputFileTracingIncludes.
        const templatePath = join(process.cwd(), "src/notebook-templates", `${name}.ipynb`);
        const raw = await readFile(templatePath, "utf-8");
        _templates.set(name, JSON.parse(raw) as NotebookJson);
    }
    return _templates.get(name)!;
}

// ── Visualization HTML builder ───────────────────────────────────────
//
// Mirrors the shape and defaults of nnsightful's Python `_widget_html()` in
// `src/nnsightful/viz/__init__.py` so that a chart exported to a notebook
// renders at the same size as one produced by `display_*()` directly. If
// you change defaults here, update them in both places.

/** Matches Python `_default_width` in nnsightful.viz. */
const DEFAULT_WIDTH = "90%";

/** Matches Python `_WIDGET_ASPECT_RATIOS` in nnsightful.viz. `null` =
 *  content-driven height (no aspect-ratio on the outer wrapper). */
const WIDGET_ASPECT_RATIOS: Record<string, string | null> = {
    logit_lens: null,
    activation_patching: "21 / 9",
    line_plot: "21 / 9",
};

interface VisualizationPayload {
    /** Widget name exposed on window by the standalone bundle (e.g. "LinePlotWidget", "LogitLensWidget"). */
    widget: string;
    /** Key into WIDGET_ASPECT_RATIOS — picks the default aspect-ratio. */
    widgetKey: keyof typeof WIDGET_ASPECT_RATIOS;
    data: Record<string, unknown>;
    options: Record<string, unknown>;
}

async function buildVisualizationHtml(payload: VisualizationPayload): Promise<string> {
    const js = await getChartsJs();
    const dataJson = JSON.stringify(payload.data);
    const optionsJson = JSON.stringify(payload.options);
    const containerId = `lp_${randomUUID().replace(/-/g, "")}`;

    const aspectRatio = WIDGET_ASPECT_RATIOS[payload.widgetKey];
    const arStyle = aspectRatio ? `aspect-ratio:${aspectRatio};` : "";
    const innerHeight = aspectRatio ? "height:100%;" : "";

    return [
        `<div style="width:${DEFAULT_WIDTH};${arStyle}"><div id="${containerId}" style="width:100%;${innerHeight}"></div></div>`,
        `<script>`,
        `(function() {`,
        js,
        `var container = document.getElementById('${containerId}');`,
        `var data = ${dataJson};`,
        `var options = ${optionsJson};`,
        `${payload.widget}(container, data, options);`,
        `})();`,
        `</script>`,
    ].join("\n");
}

// ── Tool handler interface ───────────────────────────────────────────

interface NotebookToolHandler {
    /** Template filename (without .ipynb extension). */
    templateName: string;

    /** Build Python source for the parameters cell. */
    buildParameterSource(config: Record<string, unknown>): string;

    /**
     * Build Python source for the config cell (e.g. REMOTE flag, model name).
     * Replaces the entire `# CONFIG` cell.
     */
    buildConfigSource?(config: Record<string, unknown>): string;

    /**
     * Config keys that are options of the model's version of the tool (a
     * looped model's `patch`). Those set go into the parameters cell as
     * `tool_options`, which the template's call spreads as keyword arguments.
     */
    optionKeys: string[];

    /**
     * Extract visualization data from chart data for embedding.
     * Return null to skip embedding (e.g. chart hasn't been computed yet).
     */
    buildVisualizationPayload(
        chartData: Record<string, unknown>,
        config: Record<string, unknown>,
        displayMode?: string,
        // darkMode?: boolean
    ): VisualizationPayload | null;
}

// ── Activation Patching handler ──────────────────────────────────────

/** Escape text for safe embedding inside Python triple-double-quoted strings. */
function escapePythonTripleDoubleQuoted(text: string): string {
    return text.replaceAll("\\", "\\\\").replaceAll('"""', '\\"\\"\\"');
}

type SourcePosition = number | [number, number];

function formatSrcPos(positions: SourcePosition[]): string {
    const items = positions.map((p) => (typeof p === "number" ? `${p}` : `[${p[0]}, ${p[1]}]`));
    return `[${items.join(", ")}]`;
}

const activationPatchingHandler: NotebookToolHandler = {
    templateName: "activation-patching",
    optionKeys: ["patch"],

    buildParameterSource(config) {
        const srcPrompt = escapePythonTripleDoubleQuoted((config.srcPrompt as string) ?? "");
        const tgtPrompt = escapePythonTripleDoubleQuoted((config.tgtPrompt as string) ?? "");
        const srcPos = (config.srcPos as SourcePosition[]) ?? [];
        const tgtPos = (config.tgtPos as number[]) ?? [];
        const tgtFreeze = (config.tgtFreeze as number[]) ?? [];

        return [
            `src_prompt = """${srcPrompt}"""`,
            `tgt_prompt = """${tgtPrompt}"""`,
            `src_pos = ${formatSrcPos(srcPos)}`,
            `tgt_pos = ${JSON.stringify(tgtPos)}`,
            `tgt_freeze = ${JSON.stringify(tgtFreeze)}`,
        ].join("\n");
    },

    buildConfigSource(config) {
        const model = (config.model as string) ?? "";
        return [`MODEL_NAME = "${model}"`, `REMOTE = True`].join("\n");
    },

    buildVisualizationPayload(chartData, config, displayMode) {
        const lines = chartData.lines as number[][] | undefined;
        if (!lines?.length) return null;

        const selectedTokens = config.selectedLineIndices as number[] | undefined;
        const savedMode = config.selectedMode as string | undefined;
        const VALID_MODES = ["probability", "rank", "prob_diff"];
        const mode =
            displayMode ?? (VALID_MODES.includes(savedMode ?? "") ? savedMode : "probability");

        return {
            widget: "ActivationPatchingWidget",
            widgetKey: "activation_patching",
            data: {
                lines,
                ranks: chartData.ranks ?? [],
                prob_diffs: chartData.prob_diffs ?? [],
                tokenLabels: chartData.tokenLabels ?? [],
                ...(chartData.sections ? { sections: chartData.sections } : {}),
            },
            options: { mode, selectedTokens },
        };
    },
};

// ── Handler registry ─────────────────────────────────────────────────
// Add new tool handlers here as they're implemented.

const toolHandlers: Record<string, NotebookToolHandler> = {
    "activation-patching": activationPatchingHandler,
};

// ── Model kinds ──────────────────────────────────────────────────────
// How a notebook installs and loads the chart's model. A model nnterp
// standardizes needs nothing beyond the template; add a kind here for one
// that needs its own wrapper or packages, the most specific first.

/** The catalog's facts about a chart's model that decide its kind. */
interface NotebookModel {
    looped?: boolean;
}

interface NotebookModelKind {
    /** Whether a model is of this kind; the first kind that matches is used. */
    matches(model: NotebookModel): boolean;

    /** pip requirements the setup cell installs after nnsightful. */
    requirements: string[];

    /**
     * Python source of the cell that builds `model` from `MODEL_NAME` and
     * `REMOTE`. Replaces the entire `# MODEL` cell; without it the template's
     * own cell stays.
     */
    loadSource?: string;
}

const loopedModelKind: NotebookModelKind = {
    matches: (model) => model.looped === true,
    // The first transformers release with the architecture, as the backend
    // requires (pyproject.toml); its processor needs torchvision.
    requirements: ["transformers>=5.24.0", "torchvision"],
    loadSource: [
        "from nnsightful import LoopedTransformer",
        "",
        "# A looped model: its tools count layer visits where others count layers.",
        'model = LoopedTransformer(MODEL_NAME, device_map="auto")',
    ].join("\n"),
};

const standardModelKind: NotebookModelKind = {
    matches: () => true,
    requirements: [],
};

const modelKinds: NotebookModelKind[] = [loopedModelKind, standardModelKind];

// ── Cell sources ─────────────────────────────────────────────────────

/** A config value as a Python literal, or null for one a notebook can't carry. */
function pythonLiteral(value: unknown): string | null {
    if (typeof value === "string") return JSON.stringify(value);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return value ? "True" : "False";
    return null;
}

/** The parameters cell's `tool_options` line: the handler's option keys the config sets. */
function toolOptionsSource(handler: NotebookToolHandler, config: Record<string, unknown>): string {
    const entries = handler.optionKeys.flatMap((key) => {
        const literal = pythonLiteral(config[key]);
        return literal === null ? [] : [`${JSON.stringify(key)}: ${literal}`];
    });
    return `tool_options = {${entries.join(", ")}}`;
}

/** A cell's source without its marker line. */
function withoutMarker(source: string, marker: string): string {
    return source.trimStart().slice(marker.length).replace(/^\n/, "");
}

/**
 * The setup cell with a kind's requirements installed after its last
 * `%pip install`, each quoted: the line goes through a shell, where a version
 * specifier's `>` would redirect.
 */
function setupSource(source: string, requirements: string[]): string {
    const lines = withoutMarker(source, SETUP_MARKER).split("\n");
    const last = lines.findLastIndex((line) => line.trimStart().startsWith("%pip install"));
    if (requirements.length === 0 || last === -1) return lines.join("\n");
    const indent = lines[last].slice(0, lines[last].length - lines[last].trimStart().length);
    const quoted = requirements.map((requirement) => JSON.stringify(requirement));
    lines.splice(last + 1, 0, `${indent}%pip install ${quoted.join(" ")}`);
    return lines.join("\n");
}

// ── Public API ───────────────────────────────────────────────────────

const PARAMETER_MARKER = "# PARAMETERS";
const CONFIG_MARKER = "# CONFIG";
const SETUP_MARKER = "# SETUP";
const MODEL_MARKER = "# MODEL";
const VISUALIZATION_MARKER = "# VISUALIZATION";

interface GenerateNotebookInput {
    configType: string;
    configData: Record<string, unknown>;
    chartData?: Record<string, unknown> | null;
    /** The chart's model as the catalog lists it, which decides how the
     *  notebook installs and loads it. Absent for a model no longer listed. */
    model?: NotebookModel;
    workspaceName?: string;
    chartName?: string;
    displayMode?: string;
}

/**
 * Server action: generate a Jupyter notebook (.ipynb) from a template,
 * injecting parameters from config, the setup and loading of the model's
 * kind, and optionally a pre-rendered chart visualization.
 */
export async function generateNotebook(input: GenerateNotebookInput): Promise<string> {
    const { configType, configData, chartData, workspaceName, chartName, displayMode } = input;
    const modelKind = modelKinds.find((kind) => kind.matches(input.model ?? {}))!;

    const handler = toolHandlers[configType];
    if (!handler) {
        throw new Error(`No notebook handler registered for tool type: "${configType}"`);
    }

    const template = await readTemplate(handler.templateName);

    // Build parameter source
    const parameterSource = [
        "# Parameters",
        handler.buildParameterSource(configData),
        toolOptionsSource(handler, configData),
    ].join("\n");

    // Build config source (if handler supports it)
    const configSource = handler.buildConfigSource ? handler.buildConfigSource(configData) : null;

    // Build visualization output if chart data is available
    let vizHtml: string | null = null;
    if (chartData) {
        const payload = handler.buildVisualizationPayload(chartData, configData, displayMode);
        if (payload) {
            vizHtml = await buildVisualizationHtml(payload);
        }
    }

    // Process template cells
    const cells = template.cells.map((cell) => {
        const source = normalizeSource(cell.source);

        // Replace parameter cell
        if (cell.cell_type === "code" && source.trimStart().startsWith(PARAMETER_MARKER)) {
            return {
                ...cell,
                source: parameterSource,
                outputs: [],
                execution_count: null,
            };
        }

        // Replace entire config cell
        if (
            cell.cell_type === "code" &&
            configSource &&
            source.trimStart().startsWith(CONFIG_MARKER)
        ) {
            return {
                ...cell,
                source: configSource,
                outputs: [],
                execution_count: null,
            };
        }

        // Install the model kind's requirements in the setup cell
        if (cell.cell_type === "code" && source.trimStart().startsWith(SETUP_MARKER)) {
            return {
                ...cell,
                source: setupSource(source, modelKind.requirements),
                outputs: [],
                execution_count: null,
            };
        }

        // Load the model the way its kind does
        if (cell.cell_type === "code" && source.trimStart().startsWith(MODEL_MARKER)) {
            return {
                ...cell,
                source: modelKind.loadSource ?? withoutMarker(source, MODEL_MARKER),
                outputs: [],
                execution_count: null,
            };
        }

        // Inject visualization output into cells marked with # VISUALIZATION
        // or cells that call .display()
        if (
            cell.cell_type === "code" &&
            vizHtml &&
            (source.includes(VISUALIZATION_MARKER) || source.includes(".display("))
        ) {
            return {
                ...cell,
                source,
                outputs: [
                    {
                        output_type: "display_data",
                        data: { "text/html": vizHtml },
                        metadata: {},
                    },
                ],
                execution_count: null,
            };
        }

        // Replace markdown heading placeholders with actual names
        if (cell.cell_type === "markdown") {
            if (source.startsWith("# ") && !source.startsWith("## ") && workspaceName) {
                return { ...cell, source: `# ${workspaceName}` };
            }
            if (source.startsWith("## Chart") && chartName) {
                return { ...cell, source: `## ${chartName}` };
            }
        }

        // Pass through unchanged
        return { ...cell, source };
    });

    const notebook = { ...template, cells };
    return JSON.stringify(notebook, null, 2);
}
