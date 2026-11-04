import { test, expect, type Locator, type Page } from "@playwright/test";
import {
    buildLensData,
    createTestUserOrStub,
    loginIfRequired,
    TUTORIAL_MODEL,
    type TestingUser,
} from "./TestingUtils";

/**
 * E2E for the app shell: Home at `/` and its composer, New chart and `/new`, the global
 * sidebar's item actions (rename, move to a workspace and back, delete), the
 * workspaces pages, and the old `/workbench/…` links.
 *
 * No NDIF and no Python backend: the model list is stubbed with one hot
 * model, and a logit-lens run (a chart opened with a prompt runs itself)
 * answers with a canned lens. So it runs both on a laptop (SQLite, auth
 * disabled, every test sharing the stub user and whatever charts it already
 * has) and in CI (Postgres, a fresh signed-in user). Charts are told apart by
 * id and a per-test prompt or name, never by counting rows, so tests stay
 * independent under parallel workers.
 */

let user: TestingUser;

test.beforeAll(async () => {
    user = await createTestUserOrStub();
});

/** The sidebar's collapsed-preference cookie; these tests start with it expanded. */
const SIDEBAR_COLLAPSED_COOKIE = "workbench_sidebar_collapsed";

test.beforeEach(async ({ page, baseURL }) => {
    await page
        .context()
        .addCookies([{ name: SIDEBAR_COLLAPSED_COOKIE, value: "false", url: baseURL! }]);
    await page.route("**/models/**", (route) =>
        route.fulfill({
            json: [
                {
                    name: TUTORIAL_MODEL,
                    is_chat: false,
                    n_layers: 12,
                    params: "124M",
                    gated: false,
                    allowed: true,
                    status: "hot",
                },
            ],
        }),
    );
    await page.route("**/logit_lens/run", (route) =>
        route.fulfill({
            contentType: "text/event-stream",
            body: `event: data\ndata: ${JSON.stringify(buildLensData(" Paris"))}\n\n`,
        }),
    );
    await loginIfRequired(page, user);
});

test.setTimeout(120_000);

/** A name no other test (or earlier run on a shared database) uses. */
const unique = (label: string) =>
    `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Charts and workspaces" });
const header = (page: Page) => page.locator("main header");
const chartRow = (page: Page, chartId: string) =>
    sidebar(page).locator(`a[href="/logit-lens/${chartId}"]`);
/** The actions trigger beside a sidebar row (its link's parent holds both). */
const rowActions = (row: Locator) =>
    row.locator("..").getByRole("button", { name: /^(Chart|Report) actions$/ });

/** Opens a logit-lens chart with `prompt` through `/new`, as the landing composer does; returns its id. */
async function newChart(page: Page, prompt: string): Promise<string> {
    await page.goto(`/new?tool=logit-lens&prompt=${encodeURIComponent(prompt)}`);
    await page.waitForURL(/\/logit-lens\/[0-9a-f-]{36}$/, { timeout: 60_000 });
    return new URL(page.url()).pathname.split("/")[2];
}

/** Deletes a workspace from its own page; the page then shows all workspaces. */
async function deleteWorkspace(page: Page, workspaceId: string, name: string) {
    await page.goto(`/workspaces/${workspaceId}`);
    await header(page).getByRole("button", { name: "Workspace actions" }).click();
    await page.getByRole("menuitem", { name: "Delete…" }).click();
    const dialog = page.getByRole("dialog", { name: `Delete ${name}?` });
    await dialog.getByRole("button", { name: "Delete workspace" }).click();
    await page.waitForURL(/\/workspaces$/);
}

test.describe("app shell", () => {
    test("New chart opens a chart in the sidebar with its prompt focused, and reopens it while blank", async ({
        page,
    }) => {
        await page.goto("/workspaces");
        await page.getByRole("button", { name: "New chart" }).first().click();
        await page.getByRole("menuitem", { name: "Logit Lens" }).click();
        await page.waitForURL(/\/logit-lens\/[0-9a-f-]{36}$/, { timeout: 60_000 });
        const chartId = new URL(page.url()).pathname.split("/")[2];

        await expect(chartRow(page, chartId)).toHaveAttribute("aria-current", "page");
        await expect(page.getByPlaceholder("Enter your prompt here...")).toBeFocused({
            timeout: 30_000,
        });

        // Picking the tool again focuses the same chart's prompt once the launch is done.
        await page.getByRole("button", { name: "New chart" }).first().click();
        await page.getByRole("menuitem", { name: "Logit Lens" }).click();
        await expect(page.getByPlaceholder("Enter your prompt here...")).toBeFocused({
            timeout: 30_000,
        });
        expect(new URL(page.url()).pathname).toBe(`/logit-lens/${chartId}`);
    });

    test("New chart shows the chart's empty page at once, before the chart is created", async ({
        page,
    }) => {
        await page.goto("/workspaces");
        let slow = false;
        await page.route("**/*", async (route) => {
            const request = route.request();
            if (slow && request.method() === "POST" && request.headers()["next-action"]) {
                await new Promise((resolve) => setTimeout(resolve, 2_000));
            }
            await route.continue();
        });

        slow = true;
        await page.getByRole("button", { name: "New chart" }).first().click();
        await page.getByRole("menuitem", { name: "Activation Patching" }).click();
        const pending = page.locator("main [aria-busy='true']");
        await expect(pending).toBeVisible({ timeout: 1_000 });
        await expect(pending.getByText("Source Prompt", { exact: true })).toBeVisible();
        await expect(page).toHaveURL(/\/workspaces$/);

        await page.waitForURL(/\/activation-patching\/[0-9a-f-]{36}$/, { timeout: 60_000 });
        await expect(pending).toHaveCount(0);
        await expect(page.getByPlaceholder("Enter source prompt...")).toBeVisible();
    });

    test("a chart is renamed from its sidebar row and from the page header", async ({ page }) => {
        const prompt = unique("The Eiffel Tower is in");
        const chartId = await newChart(page, prompt);
        const row = chartRow(page, chartId);
        await expect(row).toHaveAttribute("title", prompt);

        const fromRow = unique("Eiffel");
        await rowActions(row).click();
        await page.getByRole("menuitem", { name: "Rename" }).click();
        await sidebar(page).getByLabel("Chart name").fill(fromRow);
        await page.keyboard.press("Enter");
        await expect(row).toHaveAttribute("title", fromRow);
        await expect(header(page).getByRole("heading", { level: 1 })).toHaveText(fromRow);

        const fromHeader = unique("Eiffel, renamed");
        await header(page).getByRole("heading", { level: 1 }).getByRole("button").click();
        await header(page).getByLabel("Chart name").fill(fromHeader);
        await page.keyboard.press("Enter");
        await expect(header(page).getByRole("heading", { level: 1 })).toHaveText(fromHeader);
        await expect(row).toHaveAttribute("title", fromHeader);
    });

    test("a chart moves to a new workspace and back out of it", async ({ page }) => {
        const chartId = await newChart(page, unique("The capital of France is"));
        const workspace = unique("IOI circuit");

        await rowActions(chartRow(page, chartId)).click();
        await page.getByRole("menuitem", { name: "Move to workspace" }).click();
        await page.getByRole("menuitem", { name: "New workspace…" }).click();
        const dialog = page.getByRole("dialog", { name: "New workspace" });
        await dialog.getByLabel("Name").fill(workspace);
        await dialog.getByRole("button", { name: "Create and move chart" }).click();
        await expect(page.getByText(`Moved to ${workspace}`)).toBeVisible();

        const crumb = page
            .getByRole("navigation", { name: "Breadcrumb" })
            .getByRole("link", { name: workspace });
        await expect(crumb).toBeVisible();
        const workspaceId = (await crumb.getAttribute("href"))!.split("/")[2];
        const folder = sidebar(page).locator(`a[href="/workspaces/${workspaceId}"]`);
        await expect(folder).toBeVisible();
        await expect(
            folder.locator("xpath=../..").locator(`a[href="/logit-lens/${chartId}"]`),
        ).toBeVisible();

        await header(page).getByRole("button", { name: "Chart actions" }).click();
        await page.getByRole("menuitem", { name: "Remove from workspace" }).click();
        await expect(page.getByText(`Removed from ${workspace}`)).toBeVisible();
        await expect(crumb).toHaveCount(0);
        await expect(chartRow(page, chartId)).toHaveAttribute("aria-current", "page");

        await deleteWorkspace(page, workspaceId, workspace);
    });

    test("New chart and New report from a chart in a workspace file the new item there", async ({
        page,
    }) => {
        const workspace = unique("Induction heads");
        await page.goto("/workspaces");
        await header(page).getByRole("button", { name: "New workspace" }).click();
        await page
            .getByRole("dialog", { name: "New workspace" })
            .getByLabel("Name")
            .fill(workspace);
        await page.getByRole("button", { name: "Create workspace" }).click();
        await page.waitForURL(/\/workspaces\/[0-9a-f-]{36}$/);
        const workspaceId = new URL(page.url()).pathname.split("/")[2];
        await page.goto(`/new?tool=logit-lens&workspaceId=${workspaceId}`);
        await page.waitForURL(/\/logit-lens\/[0-9a-f-]{36}$/, { timeout: 60_000 });
        const firstId = new URL(page.url()).pathname.split("/")[2];
        const crumb = page
            .getByRole("navigation", { name: "Breadcrumb" })
            .getByRole("link", { name: workspace });
        await expect(crumb).toBeVisible();
        // A blank chart focuses its prompt once loaded, which would close a menu opened before.
        const prompt = page.getByPlaceholder("Enter your prompt here...");
        await expect(prompt).toBeFocused({ timeout: 30_000 });

        await page.getByRole("button", { name: "New chart" }).first().click();
        await page.getByRole("menuitem", { name: "Logit Lens" }).click();
        await page.waitForURL(
            (url) =>
                /^\/logit-lens\/[0-9a-f-]{36}$/.test(url.pathname) &&
                !url.pathname.endsWith(firstId),
            { timeout: 60_000 },
        );
        await expect(crumb).toBeVisible();
        await expect(prompt).toBeFocused({ timeout: 30_000 });

        await page.getByRole("button", { name: "New chart" }).first().click();
        await page.getByRole("menuitem", { name: "New report" }).click();
        await page.waitForURL(/\/reports\/[0-9a-f-]{36}$/);
        await expect(crumb).toBeVisible();

        await deleteWorkspace(page, workspaceId, workspace);
    });

    test("deleting the chart on screen asks first, then opens another item", async ({ page }) => {
        const keptId = await newChart(page, unique("Two plus two is"));
        const goneId = await newChart(page, unique("The opposite of hot is"));

        await rowActions(chartRow(page, keptId)).click();
        await page.getByRole("menuitem", { name: "Delete…" }).click();
        await expect(page.getByText("Delete this chart?")).toBeVisible();
        await page.getByRole("button", { name: "Cancel" }).click();
        await expect(page.getByText("Delete this chart?")).toHaveCount(0);
        await expect(chartRow(page, keptId)).toBeVisible();
        expect(new URL(page.url()).pathname).toBe(`/logit-lens/${goneId}`);

        await header(page).getByRole("button", { name: "Chart actions" }).click();
        await page.getByRole("menuitem", { name: "Delete…" }).click();
        await page.getByRole("button", { name: "Delete", exact: true }).click();

        await page.waitForURL((url) => url.pathname !== `/logit-lens/${goneId}`);
        expect(new URL(page.url()).pathname).toMatch(
            /^\/(logit-lens|j-lens|activation-patching|patch-lens|reports)\/[0-9a-f-]{36}$/,
        );
        await expect(chartRow(page, goneId)).toHaveCount(0);
        await expect(chartRow(page, keptId)).toBeVisible();
    });

    test("a workspace is created, filled, renamed and deleted from the workspaces pages", async ({
        page,
    }) => {
        const name = unique("Attention sinks");
        await page.goto("/workspaces");
        await page.locator("main header").getByRole("button", { name: "New workspace" }).click();
        await page.getByRole("dialog", { name: "New workspace" }).getByLabel("Name").fill(name);
        await page.getByRole("button", { name: "Create workspace" }).click();
        await page.waitForURL(/\/workspaces\/[0-9a-f-]{36}$/);
        const workspaceId = new URL(page.url()).pathname.split("/")[2];

        await expect(page.getByText(`${name} is empty`)).toBeVisible();
        await page.locator("main").getByRole("button", { name: "New chart" }).last().click();
        await page.getByRole("menuitem", { name: "Logit Lens" }).click();
        await page.waitForURL(/\/logit-lens\/[0-9a-f-]{36}$/, { timeout: 60_000 });
        const chartId = new URL(page.url()).pathname.split("/")[2];
        await expect(
            page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name }),
        ).toBeVisible();

        await page.goto("/workspaces");
        const card = page.locator("main li").filter({ has: page.getByRole("link", { name }) });
        const chartLink = card.locator(`a[href="/logit-lens/${chartId}"]`);
        const unfold = card.getByRole("button", { name: "1 chart" });
        await expect(unfold).toHaveAttribute("aria-expanded", "false");
        await expect(chartLink).toHaveCount(0);
        await unfold.click();
        await expect(unfold).toHaveAttribute("aria-expanded", "true");
        await expect(chartLink).toBeVisible();
        await card.getByRole("link", { name }).click();
        await page.waitForURL(`/workspaces/${workspaceId}`);
        await expect(page.locator(`main a[href="/logit-lens/${chartId}"]`)).toBeVisible();

        const trigger = page.locator("main").getByRole("button", { name: "Chart actions" });
        await trigger.click();
        const menu = page.getByRole("menu");
        await expect(menu).toBeVisible();
        const [triggerBox, menuBox] = await Promise.all([
            trigger.boundingBox(),
            menu.boundingBox(),
        ]);
        expect(menuBox!.y).toBeGreaterThan(triggerBox!.y);
        await page.keyboard.press("Escape");

        const renamed = unique("Attention sinks, take two");
        await header(page).getByRole("heading", { level: 1 }).getByRole("button").click();
        await header(page).getByLabel("Workspace name").fill(renamed);
        await page.keyboard.press("Enter");
        await expect(header(page).getByRole("heading", { level: 1 })).toHaveText(renamed);
        await expect(sidebar(page).locator(`a[href="/workspaces/${workspaceId}"]`)).toHaveAttribute(
            "title",
            renamed,
        );

        await deleteWorkspace(page, workspaceId, renamed);
        await expect(page.getByRole("link", { name: renamed })).toHaveCount(0);
    });

    test("a workspace page shows its items as preview cards, and the list view is remembered", async ({
        page,
    }) => {
        const name = unique("Previews");
        await page.goto("/workspaces");
        await page.locator("main header").getByRole("button", { name: "New workspace" }).click();
        await page.getByRole("dialog", { name: "New workspace" }).getByLabel("Name").fill(name);
        await page.getByRole("button", { name: "Create workspace" }).click();
        await page.waitForURL(/\/workspaces\/[0-9a-f-]{36}$/);
        const workspaceId = new URL(page.url()).pathname.split("/")[2];

        await page.locator("main header").getByRole("button", { name: "New report" }).click();
        await page.waitForURL(/\/reports\/[0-9a-f-]{36}$/);
        const reportId = new URL(page.url()).pathname.split("/")[2];
        const prompt = unique("The Eiffel Tower is in");
        await page.goto(
            `/new?tool=logit-lens&prompt=${encodeURIComponent(prompt)}&workspaceId=${workspaceId}`,
        );
        await page.waitForURL(/\/logit-lens\/[0-9a-f-]{36}$/, { timeout: 60_000 });
        const chartId = new URL(page.url()).pathname.split("/")[2];
        // The chart runs its prompt as it opens; the canned lens predicts " Paris".
        await expect(page.locator("main").getByText("Paris").first()).toBeVisible({
            timeout: 60_000,
        });

        const card = (href: string) =>
            page.locator("main li").filter({ has: page.locator(`a[href="${href}"]`) });
        // Until the run's result is saved, the chart's card says "Not run yet".
        await expect(async () => {
            await page.goto(`/workspaces/${workspaceId}`);
            await expect(card(`/logit-lens/${chartId}`).locator("img")).toBeVisible({
                timeout: 15_000,
            });
        }).toPass({ timeout: 60_000 });
        await expect(page.getByRole("button", { name: "Grid" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        await expect(card(`/reports/${reportId}`).locator(".powder-cover")).toBeVisible();

        await page.getByRole("button", { name: "List" }).click();
        await expect(card(`/logit-lens/${chartId}`).locator("img")).toHaveCount(0);
        await page.reload();
        await expect(page.getByRole("button", { name: "List" })).toHaveAttribute(
            "aria-pressed",
            "true",
        );
        await expect(page.locator(`main a[href="/logit-lens/${chartId}"]`)).toBeVisible();

        await deleteWorkspace(page, workspaceId, name);
    });

    test("a chart's Export menu saves it as an image", async ({ page }) => {
        const prompt = unique("The Eiffel Tower is in");
        const chartId = await newChart(page, prompt);
        // The chart runs its prompt as it opens; the canned lens predicts " Paris".
        await expect(page.locator("main").getByText("Paris").first()).toBeVisible({
            timeout: 60_000,
        });

        await page.locator("main").getByRole("button", { name: "Export" }).click();
        // Only activation patching has a notebook template.
        await expect(page.getByRole("menuitem", { name: /Jupyter notebook/ })).toHaveCount(0);
        const downloading = page.waitForEvent("download");
        await page.getByRole("menuitem", { name: /Image/ }).click();
        const download = await downloading;
        expect(download.suggestedFilename()).toBe(`${prompt}.png`);
        const chunks: Buffer[] = [];
        for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
        const png = Buffer.concat(chunks);
        expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

        await header(page).getByRole("button", { name: "Chart actions" }).click();
        await page.getByRole("menuitem", { name: "Delete…" }).click();
        await page.getByRole("button", { name: "Delete", exact: true }).click();
        await expect(chartRow(page, chartId)).toHaveCount(0);
    });

    test("the workspaces search finds a workspace by its name or by a chart in it", async ({
        page,
    }) => {
        const name = unique("Search me");
        await page.goto("/workspaces");
        await header(page).getByRole("button", { name: "New workspace" }).click();
        await page.getByRole("dialog", { name: "New workspace" }).getByLabel("Name").fill(name);
        await page.getByRole("button", { name: "Create workspace" }).click();
        await page.waitForURL(/\/workspaces\/[0-9a-f-]{36}$/);
        const workspaceId = new URL(page.url()).pathname.split("/")[2];
        const prompt = unique("The Colosseum is in");
        await page.goto(
            `/new?tool=logit-lens&prompt=${encodeURIComponent(prompt)}&workspaceId=${workspaceId}`,
        );
        await page.waitForURL(/\/logit-lens\/[0-9a-f-]{36}$/, { timeout: 60_000 });
        const chartId = new URL(page.url()).pathname.split("/")[2];

        await page.goto("/workspaces");
        const search = header(page).getByLabel("Search workspaces, charts and reports");
        const cards = page.locator("main li").filter({ has: page.locator("button[title]") });
        const card = cards.filter({ has: page.getByRole("link", { name }) });
        const chartLink = card.locator(`a[href="/logit-lens/${chartId}"]`);

        // "/" focuses the search once the page has hydrated.
        await expect(async () => {
            await page.locator("body").press("/");
            await expect(search).toBeFocused({ timeout: 1_000 });
        }).toPass({ timeout: 30_000 });
        await search.fill(name.toUpperCase());
        await expect(cards).toHaveCount(1);
        await expect(card.getByRole("button", { name: "1 chart" })).toHaveAttribute(
            "aria-expanded",
            "false",
        );

        await search.fill(prompt.slice(4));
        await expect(cards).toHaveCount(1);
        await expect(card.getByRole("button", { name: "1 of 1 matches" })).toHaveAttribute(
            "aria-expanded",
            "true",
        );
        await expect(chartLink).toBeVisible();

        await search.fill(unique("Nothing is called"));
        await expect(page.getByText(/^No workspace, chart or report matches/)).toBeVisible();
        await page
            .locator("main")
            .getByRole("button", { name: "Clear search" })
            .filter({ hasText: "Clear search" })
            .click();
        await expect(search).toHaveValue("");
        await expect(card).toBeVisible();

        await deleteWorkspace(page, workspaceId, name);
    });

    test("old /workbench links open the chart-centric pages", async ({ page }) => {
        const workspace = unique("Redirects");
        await page.goto("/workspaces");
        await page.locator("main header").getByRole("button", { name: "New workspace" }).click();
        await page
            .getByRole("dialog", { name: "New workspace" })
            .getByLabel("Name")
            .fill(workspace);
        await page.getByRole("button", { name: "Create workspace" }).click();
        await page.waitForURL(/\/workspaces\/[0-9a-f-]{36}$/);
        const workspaceId = new URL(page.url()).pathname.split("/")[2];

        await page.locator("main header").getByRole("button", { name: "New report" }).click();
        await page.waitForURL(/\/reports\/[0-9a-f-]{36}$/);
        const reportId = new URL(page.url()).pathname.split("/")[2];
        await page.goto(`/new?tool=logit-lens&workspaceId=${workspaceId}`);
        await page.waitForURL(/\/logit-lens\/[0-9a-f-]{36}$/, { timeout: 60_000 });
        const chartId = new URL(page.url()).pathname.split("/")[2];

        await page.goto(`/workbench/${workspaceId}/logit-lens/${chartId}`);
        await expect(page).toHaveURL(`/logit-lens/${chartId}`);
        await page.goto(`/workbench/${workspaceId}/lens2/${chartId}`);
        await expect(page).toHaveURL(`/logit-lens/${chartId}`);
        await page.goto(`/workbench/${workspaceId}/overview/${reportId}`);
        await expect(page).toHaveURL(`/reports/${reportId}`);
        await page.goto(`/workbench/${workspaceId}`);
        await expect(page).toHaveURL(`/logit-lens/${chartId}`);
        await page.goto("/workbench?tool=logit-lens");
        await page.waitForURL(/\/logit-lens\/[0-9a-f-]{36}$/, { timeout: 60_000 });

        await deleteWorkspace(page, workspaceId, workspace);
    });

    test("a new chart starts on a hot model, even after a chart whose model went cold", async ({
        page,
    }) => {
        const prompt = unique("The Eiffel Tower is in");
        const chartId = await newChart(page, prompt);
        await expect(page.locator("main").getByText("Paris").first()).toBeVisible({
            timeout: 60_000,
        });

        // The chart's model (gpt2) goes cold, and another model is hot but listed after it.
        const model = (name: string, status: string) => ({
            name,
            is_chat: false,
            n_layers: 12,
            params: "124M",
            gated: false,
            allowed: true,
            status,
        });
        await page.route("**/models/**", (route) =>
            route.fulfill({
                json: [model(TUTORIAL_MODEL, "cold"), model("e2e-org/hot-second", "hot")],
            }),
        );
        await page.reload();
        const pill = page.getByTestId("model-select-trigger");
        await expect(pill).toContainText("gpt2");

        // A blank chart, opened without a reload, starts on the hot model instead.
        await page.getByRole("button", { name: "New chart" }).first().click();
        await page.getByRole("menuitem", { name: "Logit Lens" }).click();
        await page.waitForURL(
            (url) =>
                /^\/logit-lens\/[0-9a-f-]{36}$/.test(url.pathname) &&
                !url.pathname.endsWith(chartId),
            { timeout: 60_000 },
        );
        await expect(pill).toContainText("hot-second");
    });

    test("Home, at /, starts a chart from the landing page's composer", async ({ page }) => {
        const prompt = unique("Home prompt");
        await page.goto("/workbench");
        await page.waitForURL((url) => url.pathname === "/");
        await expect(page.getByRole("heading", { name: "workbench" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Home" })).toHaveAttribute(
            "aria-current",
            "page",
        );

        await expect(page.getByRole("button", { name: "Select tool" })).toContainText("Logit Lens");
        await expect(page.getByRole("button", { name: "Select model" })).toContainText("gpt2");
        await expect(page.getByRole("button", { name: "Run", exact: true })).toBeDisabled();
        const promptBox = page.getByPlaceholder("Enter a prompt to analyze...");
        await promptBox.fill(prompt);
        await promptBox.press("Enter");

        await page.waitForURL(/\/logit-lens\/[0-9a-f-]{36}$/, { timeout: 60_000 });
        const chartId = new URL(page.url()).pathname.split("/")[2];
        await expect(chartRow(page, chartId)).toContainText(prompt);
    });

    test("the models page shows the cards that fit and pages through the rest", async ({
        page,
    }) => {
        const models = Array.from({ length: 60 }, (_, i) => ({
            name: `e2e-org/model-${String(i).padStart(2, "0")}`,
            is_chat: false,
            n_layers: 12,
            params: "124M",
            gated: false,
            allowed: true,
            status: "cold",
        }));
        await page.route("**/models/**", (route) => route.fulfill({ json: models }));
        await page.goto("/models");

        const panel = page.getByRole("region", { name: "Models" });
        await expect(panel.getByRole("heading", { name: "Models" })).toBeVisible();
        const cards = panel.getByRole("list").getByRole("listitem");
        await expect(cards.first()).toContainText("model-00");
        const perPage = await cards.count();
        expect(perPage).toBeLessThan(models.length);
        const area = panel.getByRole("list").locator("..");
        expect(await area.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);

        await panel.getByRole("button", { name: "Next page" }).click();
        await expect(cards.first()).toContainText(`model-${String(perPage).padStart(2, "0")}`);
        await panel.getByRole("button", { name: "Previous page" }).click();
        await expect(cards.first()).toContainText("model-00");
    });

    test("the sidebar's edge drags to resize it, and the width survives a reload", async ({
        page,
    }) => {
        await page.goto("/");
        const aside = page.locator("aside#app-sidebar");
        const handle = page.getByRole("separator", { name: "Resize sidebar" });
        const width = async () => Math.round((await aside.boundingBox())!.width);
        expect(await width()).toBe(256);

        const box = (await handle.boundingBox())!;
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 });
        await page.mouse.up();
        expect(await width()).toBe(356);

        await page.reload();
        expect(await width()).toBe(356);
        await handle.focus();
        await page.keyboard.press("Home");
        expect(await width()).toBe(208);
        await handle.dblclick();
        expect(await width()).toBe(256);
    });

    test("a running job shortens the header's model name instead of covering the chart title", async ({
        page,
    }) => {
        // A run that stays queued: one status event, and the stream never ends.
        await page.addInitScript(() => {
            const fetch = window.fetch.bind(window);
            window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
                const url = input instanceof Request ? input.url : String(input);
                if (!url.includes("/logit_lens/run")) return fetch(input, init);
                const status = { status: "QUEUED", description: "position 12" };
                const body = new ReadableStream({
                    start: (stream) =>
                        stream.enqueue(
                            new TextEncoder().encode(
                                `event: status\ndata: ${JSON.stringify(status)}\n\n`,
                            ),
                        ),
                });
                return Promise.resolve(
                    new Response(body, { headers: { "content-type": "text/event-stream" } }),
                );
            }) as typeof window.fetch;
        });
        await page.setViewportSize({ width: 800, height: 700 });

        await newChart(page, unique("Where the header's title and model pill meet"));
        await expect(header(page).getByRole("status", { name: "Job queued 12" })).toBeVisible();
        const pill = (await page.getByTestId("model-select-trigger").boundingBox())!;
        const title = (await header(page).getByRole("heading", { level: 1 }).boundingBox())!;
        expect(pill.x + pill.width).toBeLessThanOrEqual(title.x);
    });

    test("a workspace is renamed and deleted from its sidebar row", async ({ page }) => {
        const name = unique("Sidebar folder");
        await page.goto("/workspaces");
        await page.locator("main header").getByRole("button", { name: "New workspace" }).click();
        await page.getByRole("dialog", { name: "New workspace" }).getByLabel("Name").fill(name);
        await page.getByRole("button", { name: "Create workspace" }).click();
        await page.waitForURL(/\/workspaces\/[0-9a-f-]{36}$/);
        const workspaceId = new URL(page.url()).pathname.split("/")[2];
        await page.goto(`/new?tool=logit-lens&workspaceId=${workspaceId}`);
        await page.waitForURL(/\/logit-lens\/[0-9a-f-]{36}$/, { timeout: 60_000 });
        await expect(page.getByPlaceholder("Enter your prompt here...")).toBeFocused({
            timeout: 30_000,
        });

        const folderLink = sidebar(page).locator(`a[href="/workspaces/${workspaceId}"]`);
        const folderActions = folderLink
            .locator("..")
            .getByRole("button", { name: "Workspace actions" });
        await folderActions.click();
        await page.getByRole("menuitem", { name: "Rename" }).click();
        const renamed = unique("Sidebar folder, renamed");
        await sidebar(page).getByLabel("Workspace name").fill(renamed);
        await page.keyboard.press("Enter");
        await expect(folderLink).toHaveAttribute("title", renamed);

        await folderActions.click();
        await page.getByRole("menuitem", { name: "Delete…" }).click();
        const dialog = page.getByRole("dialog", { name: `Delete ${renamed}?` });
        await expect(dialog).toContainText("1 chart");
        await dialog.getByRole("button", { name: "Delete workspace" }).click();
        await page.waitForURL((url) => url.pathname === "/");
        await expect(folderLink).toHaveCount(0);
    });

    test("a first visit starts with the sidebar collapsed, and expanding it is remembered", async ({
        page,
    }) => {
        await page.context().clearCookies({ name: SIDEBAR_COLLAPSED_COOKIE });
        await page.goto("/");
        const aside = page.locator("aside#app-sidebar");
        const width = async () => Math.round((await aside.boundingBox())!.width);
        expect(await width()).toBe(48);

        await page.getByRole("button", { name: "Expand sidebar" }).press("Enter");
        await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
        expect(await width()).toBe(256);
        await page.reload();
        expect(await width()).toBe(256);
    });
});
