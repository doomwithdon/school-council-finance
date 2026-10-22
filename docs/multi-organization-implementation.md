# Multi-organization staged rollout

## Status
- Stage 1: `006_organization_identity_foundation.sql` authored, not applied by ChatGPT.
- Stage 2A: `007_backfill_organization_ids.sql` authored, not applied by ChatGPT.
- **Multi-tenant isolation and organization management are not enabled.**
- Existing Seton accounting remains single-organization until a coordinated cutover.

## Stage 2A behavior
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
