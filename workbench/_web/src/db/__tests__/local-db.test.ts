/**
 * Integration tests for local SQLite database with actual query functions.
 *
 * These tests verify that:
 * 1. The database client initializes correctly
 * 2. All query functions work with SQLite
 * 3. CRUD operations via query functions work correctly
 * 4. Relationships between tables work as expected
 * 5. JSON storage works properly in SQLite
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import { db, clearDatabase } from "../client";
import { charts, configs, chartConfigLinks } from "../schema";

// Import actual query functions
import {
    createWorkspace,
    getWorkspaces,
    getWorkspaceById,
    renameWorkspace,
    deleteWorkspace,
} from "@/lib/queries/workspaceDb";

import { getChartById, getConfigForChart, getChartsMetadata } from "@/lib/queries/chartQueries";
import {
    createLogitLensChartPair,
    createActivationPatchingChartPair,
    renameChart,
    setChartData,
    deleteChart,
    getMostRecentChartForWorkspace,
    copyChart,
} from "@/lib/queries/chartDb";

import { setConfig } from "@/lib/queries/configDb";

import { getDocumentById, getDocumentsForWorkspace } from "@/lib/queries/documentQueries";
import { createDocument, updateDocument, deleteDocument } from "@/lib/queries/documentDb";

import { DEFAULT_CHART_NAME, type ChartData, type ChartType } from "@/types/charts";
import type { LogitLensConfigData } from "@/types/logitLens";

// Test user ID (simulating the mock user from disabled auth)
const TEST_USER_ID = "test-user-123";

// Helper to create a valid LogitLensConfigData for tests
const createTestLensConfig = (prompt: string = "test"): LogitLensConfigData => ({
    prompt,
    model: "gpt2",
    topk: 5,
    includeEntropy: true,
});

// Seeds a chart of a retired tool the way old rows sit in user databases.
const insertRetiredToolChart = async (workspaceId: string, updatedAt: Date) => {
    const [chart] = await db.insert(charts).values({ workspaceId, updatedAt }).returning();
    const [config] = await db
        .insert(configs)
        .values({ workspaceId, type: "lens", data: {} })
        .returning();
    await db.insert(chartConfigLinks).values({ chartId: chart.id, configId: config.id });
    return chart;
};

// Seeds a logit lens chart under the legacy "lens2" type, as rows written
// before the rename still hold it.
const insertLegacyLogitLensChart = async (workspaceId: string) => {
    const [chart] = await db.insert(charts).values({ workspaceId, type: "lens2" }).returning();
    const [config] = await db
        .insert(configs)
        .values({ workspaceId, type: "lens2", data: createTestLensConfig() })
        .returning();
    await db.insert(chartConfigLinks).values({ chartId: chart.id, configId: config.id });
    return chart;
};

// The stored type columns, read past the query layer's legacy-name normalization.
const storedChartType = async (chartId: string) => {
    const [row] = await db.select({ type: charts.type }).from(charts).where(eq(charts.id, chartId));
    return row.type;
};

const storedConfigType = async (chartId: string) => {
    const [row] = await db
        .select({ type: configs.type })
        .from(configs)
        .innerJoin(chartConfigLinks, eq(configs.id, chartConfigLinks.configId))
        .where(eq(chartConfigLinks.chartId, chartId));
    return row.type;
};

// Schema is created by drizzle-kit push in setup.ts

beforeEach(async () => {
    // Clear all tables before each test
    await clearDatabase();
});

describe("Database Client", () => {
    it("should initialize with SQLite when NEXT_PUBLIC_LOCAL_DB is true", () => {
        expect(db).toBeDefined();
        expect(process.env.NEXT_PUBLIC_LOCAL_DB).toBe("true");
    });
});

describe("Workspace Queries", () => {
    it("should create a workspace with auto-generated UUID", async () => {
        const workspace = await createWorkspace(TEST_USER_ID, "Test Workspace");

        expect(workspace).toBeDefined();
        expect(workspace.id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
        expect(workspace.userId).toBe(TEST_USER_ID);
        expect(workspace.name).toBe("Test Workspace");
    });

    it("should get workspace by ID", async () => {
        const created = await createWorkspace(TEST_USER_ID, "Find Me");
        const found = await getWorkspaceById(created.id);

        expect(found).not.toBeNull();
        expect(found!.name).toBe("Find Me");
    });

    it("should return null for non-existent workspace", async () => {
        const found = await getWorkspaceById("non-existent-id");
        expect(found).toBeNull();
    });

    it("should get all workspaces for a user with chart and document counts", async () => {
        // Create workspaces
        const ws1 = await createWorkspace(TEST_USER_ID, "Workspace 1");
        const ws2 = await createWorkspace(TEST_USER_ID, "Workspace 2");

        // Add charts to workspace 1
        await createLogitLensChartPair(ws1.id, createTestLensConfig());
        await createLogitLensChartPair(ws1.id, createTestLensConfig("test2"));

        // Add document to workspace 2
        await createDocument(TEST_USER_ID, ws2.id);

        const workspaces = await getWorkspaces(TEST_USER_ID);

        expect(workspaces).toHaveLength(2);

        const foundWs1 = workspaces.find((w: { id: string }) => w.id === ws1.id);
        const foundWs2 = workspaces.find((w: { id: string }) => w.id === ws2.id);

        expect(foundWs1?.chartCount).toBe(2);
        expect(foundWs1?.documentCount).toBe(0);
        expect(foundWs2?.chartCount).toBe(0);
        expect(foundWs2?.documentCount).toBe(1);
    });

    it("should rename a workspace", async () => {
        const workspace = await createWorkspace(TEST_USER_ID, "Original Name");

        const updated = await renameWorkspace(TEST_USER_ID, workspace.id, "Updated Name");

        expect(updated.name).toBe("Updated Name");
    });

    it("should not rename workspace for wrong user", async () => {
        const workspace = await createWorkspace(TEST_USER_ID, "My Workspace");

        await expect(renameWorkspace("wrong-user", workspace.id, "Hacked")).rejects.toThrow(
            "Workspace not found or access denied",
        );
    });

    it("should delete a workspace", async () => {
        const workspace = await createWorkspace(TEST_USER_ID, "To Delete");
        await deleteWorkspace(TEST_USER_ID, workspace.id);

        const found = await getWorkspaceById(workspace.id);
        expect(found).toBeNull();
    });

    it("should not delete workspace for wrong user", async () => {
        const workspace = await createWorkspace(TEST_USER_ID, "Protected");
        await deleteWorkspace("wrong-user", workspace.id);

        const found = await getWorkspaceById(workspace.id);
        expect(found).not.toBeNull();
    });
});

describe("Chart Queries", () => {
    let workspaceId: string;

    beforeEach(async () => {
        await clearDatabase();
        const workspace = await createWorkspace(TEST_USER_ID, "Charts Test Workspace");
        workspaceId = workspace.id;
    });

    it("should create a logit lens chart pair", async () => {
        const lensConfig = createTestLensConfig("The capital of France is");

        const { chart, config } = await createLogitLensChartPair(workspaceId, lensConfig);

        expect(chart).toBeDefined();
        expect(chart.id).toBeDefined();
        expect(chart.workspaceId).toBe(workspaceId);

        expect(config).toBeDefined();
        expect(config.type).toBe("logit-lens");
        expect(config.data).toEqual(lensConfig);
    });

    it("should get chart by ID", async () => {
        const { chart } = await createLogitLensChartPair(workspaceId, createTestLensConfig());

        const found = await getChartById(chart.id);

        expect(found).not.toBeNull();
        expect(found!.id).toBe(chart.id);
    });

    it("should update chart name", async () => {
        const { chart } = await createLogitLensChartPair(workspaceId, createTestLensConfig());

        await renameChart(TEST_USER_ID, chart.id, "My Custom Chart");
        const updated = await getChartById(chart.id);

        expect(updated!.name).toBe("My Custom Chart");
    });

    it("should set chart data with JSON", async () => {
        const { chart } = await createLogitLensChartPair(workspaceId, createTestLensConfig());

        const chartData = {
            series: [{ name: "test", data: [1, 2, 3] }],
            labels: ["a", "b", "c"],
        };

        await setChartData(TEST_USER_ID, chart.id, chartData as any, "logit-lens");
        const updated = await getChartById(chart.id);

        expect(updated!.data).toEqual(chartData);
        expect(updated!.type).toBe("logit-lens");
    });

    it("should store the current type when setting chart data with legacy lens2", async () => {
        const { chart } = await createLogitLensChartPair(workspaceId, createTestLensConfig());

        await setChartData(TEST_USER_ID, chart.id, {} as ChartData, "lens2" as ChartType);

        expect(await storedChartType(chart.id)).toBe("logit-lens");
    });

    it("should get config for chart via link", async () => {
        const lensConfig = createTestLensConfig("linked config");
        const { chart } = await createLogitLensChartPair(workspaceId, lensConfig);

        const config = await getConfigForChart(chart.id);

        expect(config).not.toBeNull();
        expect(config!.type).toBe("logit-lens");
        expect(config!.data).toEqual(lensConfig);
    });

    it("should get most recent chart for workspace", async () => {
        const { chart: chart1 } = await createLogitLensChartPair(
            workspaceId,
            createTestLensConfig("first"),
        );

        const { chart: chart2 } = await createLogitLensChartPair(
            workspaceId,
            createTestLensConfig("second"),
        );

        const mostRecent = await getMostRecentChartForWorkspace(workspaceId);

        // Should return one of the charts we created
        expect(mostRecent).not.toBeNull();
        expect([chart1.id, chart2.id]).toContain(mostRecent!.chart.id);
        expect(mostRecent!.chart.workspaceId).toBe(workspaceId);
        expect(mostRecent!.toolType).toBe("logit-lens");
    });

    it("should skip charts of retired tools when picking the most recent chart", async () => {
        const { chart } = await createLogitLensChartPair(workspaceId, createTestLensConfig());
        await insertRetiredToolChart(workspaceId, new Date(Date.now() + 60_000));

        const mostRecent = await getMostRecentChartForWorkspace(workspaceId);

        expect(mostRecent).not.toBeNull();
        expect(mostRecent!.chart.id).toBe(chart.id);
        expect(mostRecent!.toolType).toBe("logit-lens");
    });

    it("should find no most recent chart when only retired-tool charts exist", async () => {
        await insertRetiredToolChart(workspaceId, new Date());

        expect(await getMostRecentChartForWorkspace(workspaceId)).toBeNull();
    });

    it("should route a chart without a config by its own type", async () => {
        await createLogitLensChartPair(workspaceId, createTestLensConfig());
        const [chart] = await db
            .insert(charts)
            .values({ workspaceId, type: "patch-lens", updatedAt: new Date(Date.now() + 60_000) })
            .returning();

        const mostRecent = await getMostRecentChartForWorkspace(workspaceId);

        expect(mostRecent).not.toBeNull();
        expect(mostRecent!.chart.id).toBe(chart.id);
        expect(mostRecent!.toolType).toBe("patch-lens");
    });

    it("should read a legacy lens2 chart as the most recent logit lens chart", async () => {
        const legacy = await insertLegacyLogitLensChart(workspaceId);

        const mostRecent = await getMostRecentChartForWorkspace(workspaceId);

        expect(mostRecent).not.toBeNull();
        expect(mostRecent!.chart.id).toBe(legacy.id);
        expect(mostRecent!.toolType).toBe("logit-lens");
    });

    it("should read legacy lens2 chart and config types as logit-lens", async () => {
        const legacy = await insertLegacyLogitLensChart(workspaceId);

        const [metadata] = await getChartsMetadata(workspaceId);
        expect(metadata.toolType).toBe("logit-lens");
        expect(metadata.chartType).toBe("logit-lens");
        expect((await getChartById(legacy.id))!.type).toBe("logit-lens");
        expect((await getConfigForChart(legacy.id))!.type).toBe("logit-lens");
    });

    it("should write the current type when copying a legacy lens2 chart", async () => {
        const legacy = await insertLegacyLogitLensChart(workspaceId);

        const copy = await copyChart(TEST_USER_ID, legacy.id);

        expect(await storedChartType(copy.id)).toBe("logit-lens");
        expect(await storedConfigType(copy.id)).toBe("logit-lens");
    });

    it("should get charts metadata", async () => {
        const { chart } = await createLogitLensChartPair(workspaceId, createTestLensConfig());
        await renameChart(TEST_USER_ID, chart.id, "Named Chart");

        const metadata = await getChartsMetadata(workspaceId);

        expect(metadata).toHaveLength(1);
        expect(metadata[0].name).toBe("Named Chart");
        expect(metadata[0].toolType).toBe("logit-lens");
    });

    it("should copy a chart", async () => {
        const { chart: original } = await createLogitLensChartPair(
            workspaceId,
            createTestLensConfig("original"),
        );
        await renameChart(TEST_USER_ID, original.id, "Original Chart");
        await setChartData(TEST_USER_ID, original.id, { test: "data" } as any, "logit-lens");

        const copy = await copyChart(TEST_USER_ID, original.id);

        expect(copy.id).not.toBe(original.id);
        expect(copy.name).toBe("Copy of Original Chart");
        expect(copy.data).toEqual({ test: "data" });
        expect(copy.type).toBe("logit-lens");

        // Verify copy has its own config
        const copyConfig = await getConfigForChart(copy.id);
        expect(copyConfig).not.toBeNull();
    });

    it("should leave an unnamed chart's copy unnamed", async () => {
        const { chart: original } = await createLogitLensChartPair(
            workspaceId,
            createTestLensConfig("The Eiffel Tower is in"),
        );

        const copy = await copyChart(TEST_USER_ID, original.id);
        expect(original.name).toBe(DEFAULT_CHART_NAME);
        expect(copy.name).toBe(DEFAULT_CHART_NAME);

        await renameChart(TEST_USER_ID, original.id, "  ");
        expect((await copyChart(TEST_USER_ID, original.id)).name).toBe(DEFAULT_CHART_NAME);
    });

    it("should delete a chart", async () => {
        const { chart } = await createLogitLensChartPair(workspaceId, createTestLensConfig());

        await deleteChart(TEST_USER_ID, chart.id);
        const found = await getChartById(chart.id);

        expect(found).toBeNull();
    });
});

describe("Config Queries", () => {
    let workspaceId: string;
    let chartId: string;

    beforeEach(async () => {
        await clearDatabase();
        const workspace = await createWorkspace(TEST_USER_ID, "Config Test Workspace");
        workspaceId = workspace.id;
        const { chart } = await createLogitLensChartPair(workspaceId, createTestLensConfig());
        chartId = chart.id;
    });

    it("should get the config for a chart", async () => {
        const config = await getConfigForChart(chartId);

        expect(config!.type).toBe("logit-lens");
    });

    it("should update config data", async () => {
        const configId = (await getConfigForChart(chartId))!.id;

        const updatedData: LogitLensConfigData = {
            prompt: "updated prompt",
            model: "gpt2-large",
            topk: 10,
            includeEntropy: false,
        };

        await setConfig(TEST_USER_ID, configId, {
            workspaceId,
            type: "logit-lens",
            data: updatedData,
        });

        expect((await getConfigForChart(chartId))!.data).toEqual(updatedData);
    });

    it("should store the current type when setting a config with legacy lens2", async () => {
        const config = (await getConfigForChart(chartId))!;

        await setConfig(TEST_USER_ID, config.id, {
            workspaceId,
            type: "lens2",
            data: createTestLensConfig("legacy"),
        });

        expect(await storedConfigType(chartId)).toBe("logit-lens");
    });
});

describe("Document Queries", () => {
    let workspaceId: string;

    beforeEach(async () => {
        await clearDatabase();
        const workspace = await createWorkspace(TEST_USER_ID, "Document Test Workspace");
        workspaceId = workspace.id;
    });

    it("should create a document with default content", async () => {
        const doc = await createDocument(TEST_USER_ID, workspaceId);

        expect(doc).toBeDefined();
        expect(doc.workspaceId).toBe(workspaceId);
        expect(doc.content).toBeDefined();
        // Default content has a heading "Overview"
        expect((doc.content as any).root.children[0].type).toBe("heading");
    });

    it("should get document by ID", async () => {
        const created = await createDocument(TEST_USER_ID, workspaceId);
        const found = await getDocumentById(created.id);

        expect(found).not.toBeNull();
        expect(found!.id).toBe(created.id);
    });

    it("should update document content", async () => {
        const doc = await createDocument(TEST_USER_ID, workspaceId);

        const newContent = {
            root: {
                type: "root",
                children: [
                    {
                        type: "paragraph",
                        children: [{ type: "text", text: "Updated content" }],
                    },
                ],
            },
        };

        const updated = await updateDocument(TEST_USER_ID, doc.id, newContent as any);

        expect(updated.content).toEqual(newContent);
    });

    it("should get documents for workspace with derived titles", async () => {
        await createDocument(TEST_USER_ID, workspaceId);
        await createDocument(TEST_USER_ID, workspaceId);

        const docs = await getDocumentsForWorkspace(workspaceId);

        expect(docs).toHaveLength(2);
        // Each doc should have a derivedTitle from the default "Overview" heading
        expect(docs[0].derivedTitle).toBe("Overview");
    });

    it("should delete a document", async () => {
        const doc = await createDocument(TEST_USER_ID, workspaceId);
        await deleteDocument(TEST_USER_ID, doc.id);

        const found = await getDocumentById(doc.id);
        expect(found).toBeNull();
    });
});

describe("JSON Storage in SQLite", () => {
    let workspaceId: string;

    beforeEach(async () => {
        await clearDatabase();
        const workspace = await createWorkspace(TEST_USER_ID, "JSON Test Workspace");
        workspaceId = workspace.id;
    });

    it("should handle complex nested JSON in chart data", async () => {
        const { chart } = await createLogitLensChartPair(workspaceId, createTestLensConfig());

        const complexData = {
            metadata: {
                version: "1.0",
                nested: { deep: { value: 42 } },
            },
            items: [
                { id: 1, tags: ["a", "b"] },
                { id: 2, tags: ["c", "d"] },
            ],
            nullValue: null,
            booleanTrue: true,
            booleanFalse: false,
        };

        await setChartData(TEST_USER_ID, chart.id, complexData as any, "logit-lens");
        const retrieved = await getChartById(chart.id);

        expect(retrieved!.data).toEqual(complexData);
    });

    it("should handle special characters in JSON strings", async () => {
        const { chart } = await createLogitLensChartPair(workspaceId, createTestLensConfig());

        const specialData = {
            text: "Special chars: \"quotes\", 'apostrophes', \n newlines",
            unicode: "Unicode: 日本語, émojis 🎉",
        };

        await setChartData(TEST_USER_ID, chart.id, specialData as any, "logit-lens");
        const retrieved = await getChartById(chart.id);

        expect(retrieved!.data).toEqual(specialData);
    });

    it("should handle arrays and nested objects in config data", async () => {
        const complexConfig: LogitLensConfigData & { settings?: unknown } = {
            prompt: "test",
            model: "gpt2",
            topk: 5,
            includeEntropy: true,
            settings: {
                layers: [0, 1, 2],
                options: { normalize: true, scale: 1.5 },
            },
        };

        const { config } = await createLogitLensChartPair(workspaceId, complexConfig);

        expect(config.data).toEqual(complexConfig);
    });
});

describe("Cross-Table Relationships", () => {
    it("should maintain workspace -> charts -> configs relationship", async () => {
        const workspace = await createWorkspace(TEST_USER_ID, "Relationship Test");

        // Create multiple charts with configs
        const { chart: chart1 } = await createLogitLensChartPair(
            workspace.id,
            createTestLensConfig("chart1"),
        );
        const { chart: chart2 } = await createActivationPatchingChartPair(workspace.id, {
            model: "gpt2",
            srcPrompt: "source",
            tgtPrompt: "target",
            srcPos: [],
            tgtPos: [],
            tgtFreeze: [],
        });

        // Verify charts belong to workspace
        const metadata = await getChartsMetadata(workspace.id);
        expect(metadata).toHaveLength(2);

        // Verify configs are linked to charts
        const config1 = await getConfigForChart(chart1.id);
        const config2 = await getConfigForChart(chart2.id);
        expect(config1!.type).toBe("logit-lens");
        expect(config2!.type).toBe("activation-patching");

        // Verify workspace count includes charts
        const workspaces = await getWorkspaces(TEST_USER_ID);
        expect(workspaces[0].chartCount).toBe(2);
    });

    it("should handle multiple documents per workspace", async () => {
        const workspace = await createWorkspace(TEST_USER_ID, "Multi-Doc Test");

        await createDocument(TEST_USER_ID, workspace.id);
        await createDocument(TEST_USER_ID, workspace.id);
        await createDocument(TEST_USER_ID, workspace.id);

        const docs = await getDocumentsForWorkspace(workspace.id);
        expect(docs).toHaveLength(3);

        const workspaces = await getWorkspaces(TEST_USER_ID);
        expect(workspaces[0].documentCount).toBe(3);
    });
});
