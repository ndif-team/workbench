import { test, expect } from '@playwright/test';

// Helpers to mock backend endpoints
function mockBackend(page: import('@playwright/test').Page) {
  // Models list
  page.route('**/models/', async route => {
    await route.fulfill({ json: [{ name: 'test-model', id: 'm1' }] });
  });

  // Tokenize
  page.route('**/models/encode', async route => {
    const body = await route.request().postDataJSON();
    const text: string = body?.text ?? '';
    const tokens = text.split(/\s+/).filter(Boolean).map((t, i) => ({ idx: i, id: i, text: t }));
    await route.fulfill({ json: tokens });
  });

  // Execute selected -> return job id
  page.route('**/models/get-execute-selected', async route => {
    await route.fulfill({ json: { job_id: 'job-1' } });
  });
  // Listen SSE substitute with JSON
  page.route('**/models/listen-execute-selected/**', async route => {
    await route.fulfill({ json: [ { idx: 0, ids: [1,2,3], probs: [0.1, 0.2, 0.7], texts: ['a','b','c'] } ] });
  });

  // Grid/Line create -> return job id
  page.route('**/lens/get-grid', async route => { await route.fulfill({ json: { job_id: 'grid-1' } }); });
  page.route('**/lens/get-line', async route => { await route.fulfill({ json: { job_id: 'line-1' } }); });
  page.route('**/lens/listen-grid/**', async route => {
    const grid = {
      rows: Array.from({ length: 10 }, (_, r) => ({ id: `r${r}`, data: Array.from({ length: 12 }, (_, c) => ({ x: c, y: Math.random(), label: '' })) }))
    };
    await route.fulfill({ json: grid });
  });
  page.route('**/lens/listen-line/**', async route => {
    const line = { lines: [{ id: 'l1', data: Array.from({ length: 10 }, (_, i) => ({ x: i, y: Math.random() })) }] };
    await route.fulfill({ json: line });
  });
}

test.beforeEach(async ({ page }) => {
  await mockBackend(page);
});

test('Create workspace via dialog', async ({ page }) => {
  await page.goto('/workbench');

  await page.getByTestId('create-workspace-open').click();
  await page.getByTestId('create-workspace-input').fill('My E2E Workspace');

  // Intercept server action to create workspace via DB; simulate client navigation to lens page
  await page.route('**/workbench/**/lens', route => route.continue());

  // Clicking confirm triggers mutation and navigation; since server action uses DB, we just allow navigation assert URL pattern
  await page.getByTestId('create-workspace-confirm').click();

  await expect(page).toHaveURL(/\/workbench\/.*\/lens/);
});

test('Create chart pair, type prompt, tokenize, create heatmap and interact', async ({ page }) => {
  // Prepare a workspace lens page directly
  await page.goto('/workbench');

  // If first test already created a workspace and navigated, we might land on lens; otherwise, open dialog and create again
  if (page.url().endsWith('/workbench')) {
    await page.getByTestId('create-workspace-open').click();
    await page.getByTestId('create-workspace-input').fill('Another Workspace');
    await page.getByTestId('create-workspace-confirm').click();
    await expect(page).toHaveURL(/\/workbench\/.*\/lens/);
  }

  // Create a new chart pair from sidebar
  await page.getByRole('button', { name: /new/i }).click();

  // Type a prompt and tokenize
  const prompt = page.getByTestId('prompt-textarea');
  await prompt.fill('hello world from playwright');
  await page.getByTestId('tokenize-button').click();

  // After tokenize, token area shows, predictions loaded, create heatmap is available
  await page.getByTestId('token-area-container').waitFor();
  await page.getByTestId('create-heatmap-button').click();

  // Heatmap should render
  await page.getByTestId('heatmap-controls').waitFor();
  const heatmap = page.getByTestId('heatmap-canvas');
  await heatmap.waitFor();

  // Toggle zoom, then click twice to select area, then reset
  await page.getByTestId('zoom-toggle').click();
  await heatmap.click({ position: { x: 50, y: 50 } });
  await heatmap.click({ position: { x: 150, y: 150 } });
  await page.getByTestId('reset-ranges').click();

  // Basic assertion: controls are visible and interactive
  await expect(page.getByTestId('x-range-step')).toBeVisible();
});