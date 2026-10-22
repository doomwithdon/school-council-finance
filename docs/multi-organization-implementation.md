# Multi-organization staged rollout

## Status
- Stage 1: `006_organization_identity_foundation.sql` authored, not applied by ChatGPT.
- Stage 2A: `007_backfill_organization_ids.sql` authored, not applied by ChatGPT.
- **Multi-tenant isolation and organization management are not enabled.**
- Existing Seton accounting remains single-organization until a coordinated cutover.

- Stage 2B: `008_finance_tenant_link_guards.sql` authored, not applied by ChatGPT. It validates existing accounting references and adds triggers rejecting cross-organization financial-year, GL and fundraiser links. This is not a substitute for tenant RLS.\n\n- Stage 2C: `009_tenant_rls_cutover_DRAFT.sql` authored, NOT deployed. Adds membership-based authorization and tenant RLS, but deliberately blocks execution without a cutover setting. It must be reviewed and released only with tenant-aware application routes, RPCs, import/backup and tests.\n\n## Stage 2A behavior
Adds `organization_id` to all accounting, year, GL, backup, audit, snapshot and import tables; tags legacy records as Seton; validates non-null tagging and creates lookup indexes. Temporary Seton defaults preserve existing inserts and must be removed during cutover.

The migration is intentionally not a tenant-isolation release. Existing globally permissive RLS, unique keys, RPCs, import and restore routes still require replacement. **Do not onboard other organizations at this stage.**

## Critical cutover checklist
1. Verified production backup and staging test of 006 and 007.
2. Replace global `gl_codes.code` primary key and its foreign keys with tenant-aware keys; replace financial-year label uniqueness with (organization_id,label).
3. Composite tenant-aware foreign keys for all financial-year, GL and fundraiser references.
4. Remove temporary Seton defaults, enforce tenant IDs on all new writes, and migrate role checks from profiles to organization memberships.
5. Replace all permissive finance RLS policies and SECURITY DEFINER RPCs, including snapshot/restore, close-year and atomic import.
6. Replace full-table backup restore with transactional, tenant-scoped restore. Validate organization membership even for service-role operations.
7. Tenant-scope all application reads, actions, API routes, Excel exports/imports and audit logs.
8. Implement organization switching and platform admin organization creation, then tenant-aware user management.
9. Negative tests with two organizations and a multi-member user with different roles, including cross-org ID guessing and forged import payloads.
10. Deploy schema and app together only after tests pass; reconcile Seton totals against the backup.

## Stage 2D — application integration (prepared, disabled)
- `lib/organization.ts` resolves active organization and memberships when `MULTI_ORG_CUTOVER_ENABLED=true`.
- `components/OrganizationSwitcher.tsx` displays the organization and membership role, and offers a switch form for multi-organization members.
- `app/organizations/actions.ts` calls the membership-validated `switch_organization` RPC.
- `app/layout.tsx` integrates the component in the authenticated header.
- **DO NOT enable `MULTI_ORG_CUTOVER_ENABLED`** until migration 009, tenant-aware application queries, RPCs, imports, backup restores, membership role checks and end-to-end tests are complete. The existing global role checks in `lib/auth.ts` are not tenant-safe.
- Existing single-organization deployments need no new environment variables; flag defaults off.

## Stage 2E — partial app hardening (committed, flag off)
- `lib/auth.ts` resolves role from active membership when enabled.
- `lib/year.ts` scopes financial-year helpers to active organization.
- `app/api/export/route.ts` scopes year, GL and fundraiser entry lookup and export branding. Finance rows are year-filtered; RLS remains mandatory.
- `app/backup/actions.ts` blocks both legacy full-database backup and restore when multi-org mode is enabled, avoiding global destructive operations.
- **Not complete:** import API, all page/actions, SECURITY DEFINER functions, financial-year close, safe tenant backup/restore, tenant-specific GL uniqueness and integration tests. Keep flag off and do not run cutover migrations.

## Stage 2F — legacy privileged operation guards
- `app/api/import/route.ts`: legacy service-role POST import is blocked while multi-org flag is enabled (HTTP 503); GET import history checks active membership role and organization.
- `app/years/actions.ts`: legacy close-year RPC is blocked in multi-org mode until its database function is tenant-safe.
- Existing Seton import and close-year behavior is unchanged with flag off.
- **Not yet implemented:** tenant-safe replacement atomic importer and close-year function. Multi-org cutover remains prohibited.

## Stage 2G — import destination read authorization
- The legacy Excel import API now resolves the target financial year through the authenticated user's RLS-scoped Supabase session, rather than using service-role reads.
- Multi-org import POST remains blocked until a tenant-aware atomic database function replaces the legacy implementation.
- This does not yet make the privileged RPC safe for multi-tenancy. The current RPC writes GL codes and finance rows without explicit tenant arguments.
- Remaining: org-aware unique GL keys, tenant-scoped atomic import SQL, application binding, staging reconciliation and negative security tests.

## Stage 2H — tenant GL key cutover draft
- `010_tenant_gl_key_cutover_DRAFT.sql` changes the GL primary key to `(organization_id,code)` and replaces dependent foreign keys with composite tenant-safe foreign keys.
- It is **gated and must not be run** until every caller that assumes `gl_codes(code)` is globally unique is updated, including atomic Excel import and GL management actions.
- Not yet completed: tenant-specific year label constraints, atomic import replacement, backup restore, RLS cutover, tenant-scoped pages/actions, and end-to-end tests.

## Stage 2I — tenant atomic importer draft
- `011_tenant_atomic_import_DRAFT.sql` introduces a separate, gated tenant-specific import RPC draft. It is **not deployed, not tested and not ready to enable**.
- The draft requires organization ownership and an authorized membership, and tags imported data, backups, snapshots, and audit entries with the tenant.
- Security review required: service-role callers must derive actor identity from the verified session, not arbitrary payloads; test GL and year unique indexes, conflict clauses, row-level tenant integrity, idempotency and rollback; inspect generated SQL against staging schema.
- Legacy POST remains blocked under the multi-org feature flag. Do not enable the draft RPC or switch the API to it before review and testing.

## Stage 2K — read-only import preflight
- Added `POST /api/import/preflight` to verify the authenticated actor, active organization finance role, organization-owned financial year, and closed-year / workbook mismatch confirmations.
- The endpoint uses only the user-scoped Supabase client, returns `writeEnabled:false`, and does not execute imports or use service-role credentials.
- The endpoint is available only when `MULTI_ORG_CUTOVER_ENABLED=true`, which must remain disabled in production until coordinated RLS/database testing is complete.
- Remaining: validate in staging, secure the SQL import function, integrate the preflight with the upload UI, test negative cross-tenant scenarios, and implement tenant-safe writes.

## Stage 2L — Excel UI preflight integration
- The Excel import page calls `POST /api/import/preflight` before attempting an import.
- An explicit `Tenant preflight is disabled` 404 response preserves legacy single-organization importing; any other error fails closed.
- In multi-org mode, the preflight result is displayed but **no write** is performed. The legacy import POST remains blocked.
- No build, staging validation, or database migrations have been executed for this stage. Continue to keep the multi-org feature disabled in production.

## Stage 2M — static tenant regression tests
- `npm run test:tenant-guards` runs dependency-free Node tests for legacy import blocking, preflight read-only scope, draft importer predicates, and GL migration gates.
- These are static source checks, **not** a replacement for staging SQL execution, RLS tests, or authenticated cross-tenant API tests.
- Before production cutover, verify a council member cannot access, import, overwrite, or close another organization's financial year; verify rollback and financial reconciliation in staging.
