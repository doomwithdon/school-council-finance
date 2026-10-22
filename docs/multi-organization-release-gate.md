# Multi-organization release gate

**Status: NOT READY FOR PRODUCTION.** This document is a cutover checklist, not authorization to apply draft SQL.

## Implemented
- Organization and membership foundations, draft tenant RLS and GL-key migrations.
- Active-organization selection and role-aware server auth, year and export reads.
- Read-only Excel import preflight; legacy Excel writes blocked when multi-org is enabled.
- Legacy global user administration, GL mutations, full backup/restore and year closing blocked during multi-org mode.
- Draft tenant atomic importer (not activated), staging read-isolation tests and transactional write-denial probe.
- Organization-specific financial year label migration 012 (draft, approval gated).

## Blocking work before enabling multi-org
1. Audit every server action, API route, SSR query and security-definer RPC for tenant-scoped read/write, including financial transactions, snapshots, fundraiser operations, users and audit logs.
2. Implement tenant-aware organization member administration with explicit membership authorization. Never use global profile roles to authorize a tenant operation.
3. Replace legacy GL management with composite (organization_id,code) queries and verify all existing joins, upserts, conflict targets and foreign keys.
4. Replace legacy close-year, snapshot, backup and restore RPCs with tenant-safe atomic implementations; keep old entrypoints blocked.
5. Harden draft Excel import RPC: verify caller identity server-side, scope every read and write, check duplicate keys and closed-year confirmation, and prove rollback on injected reconciliation failure.
6. Review migrations 006–012 together against a fresh staging schema. Check global unique constraints, table permissions, security-definer grants, default organization IDs and all RLS policies.
7. Seed two independent councils with overlapping year labels and GL codes; run both static and authenticated staging tests. Add negative update/delete tests and import/restore rollback tests.
8. Perform Next.js production build, lint/typecheck, full UI acceptance testing for both council roles and platform administrators.
9. Produce verified backup, rollback plan, maintenance window, and production data migration rehearsal. Require an explicit human go/no-go.

## Do not activate yet
- MULTI_ORG_CUTOVER_ENABLED
- app.enable_tenant_cutover
- app.enable_gl_key_cutover
- app.enable_tenant_import_cutover
- app.enable_tenant_year_key_cutover

## Safe checks now
```bash
npm run test:tenant-guards
npm run build
```
Staging tests require separate credentials and must never target production.
