"use server";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";

const require = createRequire(import.meta.url);

// ── Charts.js singleton ──────────────────────────────────────────────

let _chartsJs: string | null = null;

function getChartsJs(): string {
    if (!_chartsJs) {
        const chartsPath = require.resolve("nnsightful/standalone");
        _chartsJs = readFileSync(chartsPath, "utf-8");
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

function readTemplate(name: string): NotebookJson {
    if (!_templates.has(name)) {
        // process.cwd() is the project root in both local dev and Vercel.
        // Templates are included in Vercel builds via outputFileTracingIncludes
        // in next.config.js.
        const templatePath = join(
            process.cwd(),
            "src/notebook-templates",
            `${name}.ipynb`
        );
        const raw = readFileSync(templatePath, "utf-8");
        _templates.set(name, JSON.parse(raw) as NotebookJson);
    }
    return _templates.get(name)!;
}

// ── Visualization HTML builder ───────────────────────────────────────

interface VisualizationPayload {
    /** Widget name exposed on window by the standalone bundle (e.g. "LinePlotWidget", "LogitLensWidget"). */
    widget: string;
    data: Record<string, unknown>;
    options: Record<string, unknown>;
}

function buildVisualizationHtml(payload: VisualizationPayload): string {
    const js = getChartsJs();
    const dataJson = JSON.stringify(payload.data);
    const optionsJson = JSON.stringify(payload.options);
    const containerId = `lp_${randomUUID().replace(/-/g, "")}`;

    return [
        `<div id="${containerId}" style="width:80%;height:300px;"></div>`,
        `<script>`,
        `(function() {`,
        js,
        `var container = document.getElementById('${containerId}');`,
        `var data = ${dataJson};`,
        `var options = ${optionsJson};`,
        `window.${payload.widget}(container, data, options);`,
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
     * Extract visualization data from chart data for embedding.
     * Return null to skip embedding (e.g. chart hasn't been computed yet).
     */
    buildVisualizationPayload(
        chartData: Record<string, unknown>,
        config: Record<string, unknown>,
        displayMode?: string
    ): VisualizationPayload | null;
}

// ── Activation Patching handler ──────────────────────────────────────

/** Escape text for safe embedding inside Python triple-double-quoted strings. */
function escapePythonTripleDoubleQuoted(text: string): string {
    return text
        .replaceAll("\\", "\\\\")
        .replaceAll('"""', '\\"\\"\\"');
}

type SourcePosition = number | [number, number];

function formatSrcPos(positions: SourcePosition[]): string {
    const items = positions.map((p) =>
        typeof p === "number" ? `${p}` : `[${p[0]}, ${p[1]}]`
    );
    return `[${items.join(", ")}]`;
}

const activationPatchingHandler: NotebookToolHandler = {
    templateName: "activation-patching",

    buildParameterSource(config) {
        const srcPrompt = escapePythonTripleDoubleQuoted(
            (config.srcPrompt as string) ?? ""
        );
        const tgtPrompt = escapePythonTripleDoubleQuoted(
            (config.tgtPrompt as string) ?? ""
        );
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
        return [
            `MODEL_NAME = "${model}"`,
            `REMOTE = True`,
        ].join("\n");
    },

    buildVisualizationPayload(chartData, config, displayMode) {
        const lines = chartData.lines as number[][] | undefined;
        const ranks = chartData.ranks as number[][] | undefined;
        const probDiffs = chartData.prob_diffs as number[][] | undefined;
        const tokenLabels = chartData.tokenLabels as string[] | undefined;
        if (!lines?.length) return null;

        const indices =
            (config.selectedLineIndices as number[]) ?? [0, 1];

        const filterByIndices = <T>(arr: T[]): T[] =>
            indices.filter((i) => i < arr.length).map((i) => arr[i]);

        const mode = displayMode ?? "probability";

        return {
            widget: "ActivationPatchingWidget",
            data: {
                lines: filterByIndices(lines),
                ranks: ranks ? filterByIndices(ranks) : [],
                prob_diffs: probDiffs ? filterByIndices(probDiffs) : [],
                tokenLabels: tokenLabels ? filterByIndices(tokenLabels) : [],
            },
            options: { mode },
        };
    },
};

// ── Handler registry ─────────────────────────────────────────────────
// Add new tool handlers here as they're implemented.

const toolHandlers: Record<string, NotebookToolHandler> = {
    "activation-patching": activationPatchingHandler,
};

// ── Public API ───────────────────────────────────────────────────────

const PARAMETER_MARKER = "# PARAMETERS";
const CONFIG_MARKER = "# CONFIG";
const VISUALIZATION_MARKER = "# VISUALIZATION";

interface GenerateNotebookInput {
    configType: string;
    configData: Record<string, unknown>;
    chartData?: Record<string, unknown> | null;
    workspaceName?: string;
    chartName?: string;
    displayMode?: string;
}

/**
 * Server action: generate a Jupyter notebook (.ipynb) from a template,
 * injecting parameters from config and optionally embedding a
 * pre-rendered chart visualization.
 */
export async function generateNotebook(
    input: GenerateNotebookInput
): Promise<string> {
    const { configType, configData, chartData, workspaceName, chartName, displayMode } = input;

    const handler = toolHandlers[configType];
    if (!handler) {
        throw new Error(
            `No notebook handler registered for tool type: "${configType}"`
        );
    }

    const template = readTemplate(handler.templateName);

    // Build parameter source
    const parameterSource = `# Parameters\n${handler.buildParameterSource(configData)}`;

    // Build config source (if handler supports it)
    const configSource = handler.buildConfigSource
        ? handler.buildConfigSource(configData)
        : null;

    // Build visualization output if chart data is available
    let vizHtml: string | null = null;
    if (chartData) {
        const payload = handler.buildVisualizationPayload(
            chartData,
            configData,
            displayMode
        );
        if (payload) {
            vizHtml = buildVisualizationHtml(payload);
        }
    }

    // Process template cells
    const cells = template.cells.map((cell) => {
        const source = normalizeSource(cell.source);

        // Replace parameter cell
        if (
            cell.cell_type === "code" &&
            source.trimStart().startsWith(PARAMETER_MARKER)
        ) {
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
