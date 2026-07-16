-- Enable Row Level Security on every public application table and define
-- owner-scoped access policies.
--
-- WHY THIS EXISTS
-- Supabase's PostgREST auto-exposes every table in the `public` schema over
-- HTTP, authorized by the *public* anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY,
-- shipped to every browser). With RLS disabled, anyone holding that key can
-- read and modify all rows in these tables (workspaces, prompts, documents,
-- prolific study IDs, ...). Enabling RLS closes that hole.
--
-- WHY IT DOES NOT BREAK THE APP
-- The workbench never reads/writes these tables through PostgREST. All table
-- access goes through Drizzle over DATABASE_URL as the `postgres` role, which
-- has BYPASSRLS; supabase-js is used only for `.auth` and `.storage`. The
-- service_role key (used by the test suite) also bypasses RLS. We deliberately
-- do NOT use FORCE ROW LEVEL SECURITY, so the table-owning `postgres` role and
-- service_role continue to bypass — exactly the roles the app and tests use.
--
-- OWNERSHIP GRAPH
-- `workspaces.user_id` = `auth.uid()::text` is the root of ownership. Every
-- other table inherits ownership by walking back to its workspace (directly via
-- workspace_id, or via chart_id -> charts -> workspace). Policies are scoped
-- `TO authenticated`; `anon` matches no policy and is therefore denied on all
-- tables. auth.uid() is wrapped in a scalar sub-select so Postgres caches it as
-- an initplan (Supabase's recommended RLS performance pattern).
--
-- NOT INCLUDED (by design)
-- No anon-readable policy for `workspaces.public = true`. That sharing path is
-- not served over PostgREST today, and a blanket table policy would expose
-- user_id / prolific columns. Public sharing over the API, if ever needed,
-- should be a column-limited view, not a table policy.
--
-- ORPHAN TABLES
-- Some tables exist in the live DB but not in the Drizzle schema (e.g.
-- `generations`, left over from the removed generation panel). PostgREST
-- exposes those too. So rather than enable RLS on a hand-listed set, we enable
-- it on EVERY base table in `public` — this self-heals against current and
-- future orphans, locking them to default-deny (bypass roles only) until
-- someone gives them an explicit policy. The owner-scoped policies below then
-- layer onto the known application tables.
--
-- Idempotent: safe to re-run (enable-rls is a no-op if already on; policies are
-- dropped-if-exists before creation).

begin;

-- ── Enable RLS on every public base table (covers known + orphan tables) ─────
do $$
declare
    t text;
begin
    for t in
        select tablename from pg_tables where schemaname = 'public'
    loop
        execute format('alter table public.%I enable row level security', t);
    end loop;
end $$;

-- ── workspaces : the ownership root ──────────────────────────────────────────
drop policy if exists workspaces_owner_all on public.workspaces;
create policy workspaces_owner_all on public.workspaces
    for all
    to authenticated
    using (user_id = (select auth.uid())::text)
    with check (user_id = (select auth.uid())::text);

-- ── charts : owned via workspace_id ──────────────────────────────────────────
drop policy if exists charts_owner_all on public.charts;
create policy charts_owner_all on public.charts
    for all
    to authenticated
    using (
        exists (
            select 1 from public.workspaces w
            where w.id = charts.workspace_id
              and w.user_id = (select auth.uid())::text
        )
    )
    with check (
        exists (
            select 1 from public.workspaces w
            where w.id = charts.workspace_id
              and w.user_id = (select auth.uid())::text
        )
    );

-- ── configs : owned via workspace_id ─────────────────────────────────────────
drop policy if exists configs_owner_all on public.configs;
create policy configs_owner_all on public.configs
    for all
    to authenticated
    using (
        exists (
            select 1 from public.workspaces w
            where w.id = configs.workspace_id
              and w.user_id = (select auth.uid())::text
        )
    )
    with check (
        exists (
            select 1 from public.workspaces w
            where w.id = configs.workspace_id
              and w.user_id = (select auth.uid())::text
        )
    );

-- ── documents : owned via workspace_id ───────────────────────────────────────
drop policy if exists documents_owner_all on public.documents;
create policy documents_owner_all on public.documents
    for all
    to authenticated
    using (
        exists (
            select 1 from public.workspaces w
            where w.id = documents.workspace_id
              and w.user_id = (select auth.uid())::text
        )
    )
    with check (
        exists (
            select 1 from public.workspaces w
            where w.id = documents.workspace_id
              and w.user_id = (select auth.uid())::text
        )
    );

-- ── lens_runs : owned via workspace_id ───────────────────────────────────────
drop policy if exists lens_runs_owner_all on public.lens_runs;
create policy lens_runs_owner_all on public.lens_runs
    for all
    to authenticated
    using (
        exists (
            select 1 from public.workspaces w
            where w.id = lens_runs.workspace_id
              and w.user_id = (select auth.uid())::text
        )
    )
    with check (
        exists (
            select 1 from public.workspaces w
            where w.id = lens_runs.workspace_id
              and w.user_id = (select auth.uid())::text
        )
    );

-- ── views : owned via chart_id -> charts -> workspace ────────────────────────
drop policy if exists views_owner_all on public.views;
create policy views_owner_all on public.views
    for all
    to authenticated
    using (
        exists (
            select 1 from public.charts c
            join public.workspaces w on w.id = c.workspace_id
            where c.id = views.chart_id
              and w.user_id = (select auth.uid())::text
        )
    )
    with check (
        exists (
            select 1 from public.charts c
            join public.workspaces w on w.id = c.workspace_id
            where c.id = views.chart_id
              and w.user_id = (select auth.uid())::text
        )
    );

-- ── chart_config_links : owned via chart_id -> charts -> workspace ───────────
drop policy if exists chart_config_links_owner_all on public.chart_config_links;
create policy chart_config_links_owner_all on public.chart_config_links
    for all
    to authenticated
    using (
        exists (
            select 1 from public.charts c
            join public.workspaces w on w.id = c.workspace_id
            where c.id = chart_config_links.chart_id
              and w.user_id = (select auth.uid())::text
        )
    )
    with check (
        exists (
            select 1 from public.charts c
            join public.workspaces w on w.id = c.workspace_id
            where c.id = chart_config_links.chart_id
              and w.user_id = (select auth.uid())::text
        )
    );

-- ── workshops : admin-managed metadata, no client access ─────────────────────
-- Created and read only through server actions (Drizzle `postgres` role) and
-- the /w/{slug} join flow (also server-side). RLS on with NO policy => anon and
-- authenticated are both fully denied over PostgREST; only bypass roles reach it.
alter table public.workshops enable row level security;

commit;
