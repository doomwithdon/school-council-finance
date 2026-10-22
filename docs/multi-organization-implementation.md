# Multi-organization implementation — staged rollout

**Status:** Stage 1 migration authored, NOT executed. Multi-organization accounting is NOT active. Do not add a second live organization yet.

## Stage 1 (prepared)
Migration `006_organization_identity_foundation.sql` creates organizations, memberships and a separate platform_admins table with RLS. It inserts the existing Seton organization and copies existing user roles into memberships. It does not touch existing accounting records, legacy roles or finance RLS. The platform administrator must be explicitly assigned after checking the user UUID.

## Stage 2 (required before enabling multiple organizations)
- Tenant-scope all finance tables and their foreign keys: financial_years, gl_codes, budgets, actuals, bank_transactions, cheques, fundraisers, fundraiser_entries, snapshots, import_runs, database_backups, audit_log.
- Backfill all existing records into Seton before enforcing NOT NULL.
- Replace globally unique financial-year labels and GL code keys with tenant-specific uniqueness and safe composite references.
- Replace permissive global finance RLS with membership-based tenant RLS. Tenant membership must be checked server-side; never trust a client-selected org ID.
- Replace role authorization using profiles.role with membership role for the selected organization.
- Rewrite security-definer RPCs (close year, snapshots, Excel import) to validate the selected tenant, record ownership and role.
- Rewrite backup restore: current implementation deletes all finance rows and must never run after introducing multiple tenants without tenant scoping.
- Restrict service-role Excel import and export to a validated tenant; include tenant in fingerprint and import audit.
- Build platform admin organization management, organization switcher, and organization membership administration.
- Add cross-tenant tests for UUID guessing, read/write, exports, imports, year closing, snapshots, backups and user administration.
- Keep a verified pre-migration database backup and compare Seton totals after migration.

## Release gate
**Do not activate organization creation for end users until Stage 2 has passed tenant isolation tests.**
