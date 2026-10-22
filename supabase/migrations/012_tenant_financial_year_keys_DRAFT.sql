-- DRAFT ONLY: multiple councils need the same YYYY-YYYY financial-year label.
-- Coordinate with tenant RLS and application cutover; DO NOT run in production.
begin;
do $$
begin
 if current_setting('app.enable_tenant_year_key_cutover',true) is distinct from 'approved'
 then raise exception 'Tenant financial-year key cutover is not approved'; end if;
end $$;

-- Migration 002 created a globally unique label, preventing two councils
-- from both having 2026-2027. Tenant identity must be part of the key.
alter table public.financial_years drop constraint if exists financial_years_label_key;
create unique index if not exists financial_years_org_label_unique
 on public.financial_years(organization_id,label);

-- Reject missing tenant identity after the backfill migration.
alter table public.financial_years alter column organization_id set not null;

commit;
