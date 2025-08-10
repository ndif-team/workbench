### E2E tests (Playwright + Bun)

- Install Bun if not present:
  - curl -fsSL https://bun.sh/install | bash
  - source ~/.bashrc

- From `workbench/_web`:
  - Set env for E2E: `export NEXT_PUBLIC_E2E=true`
  - Run the app and tests via Playwright runner (the config starts the dev server):

```
bunx playwright test
```

- UI mode:
```
bunx playwright test --ui
```

Notes:
- E2E mode bypasses Supabase middleware and uses a mock DB to avoid Postgres.
- Backend endpoints are intercepted in tests and SSE is replaced with JSON fetch.