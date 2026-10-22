-- Stage 2A: non-destructive accounting tenant backfill.
-- PREREQUISITE: 006_organization_identity_foundation.sql
-- IMPORTANT: this migration DOES NOT turn on multi-tenant access. Do not create
-- additional organizations until tenant-aware RLS, RPCs and routes are deployed.
-- All existing Seton records are preserved and tagged to the original council.
begin;

do $$
begin
 if not exists(select 1 from public.organizations where slug='seton-council')
 then raise exception 'Run migration 006 first'; end if;
end $$;

alter table public.financial_years add column if not exists organization_id uuid references public.organizations(id);
alter table public.gl_codes add column if not exists organization_id uuid references public.organizations(id);
alter table public.budgets add column if not exists organization_id uuid references public.organizations(id);
alter table public.actuals add column if not exists organization_id uuid references public.organizations(id);
alter table public.bank_transactions add column if not exists organization_id uuid references public.organizations(id);
alter table public.cheques add column if not exists organization_id uuid references public.organizations(id);
alter table public.fundraisers add column if not exists organization_id uuid references public.organizations(id);
alter table public.fundraiser_entries add column if not exists organization_id uuid references public.organizations(id);
alter table public.budget_snapshots add column if not exists organization_id uuid references public.organizations(id);
alter table public.database_backups add column if not exists organization_id uuid references public.organizations(id);
alter table public.import_runs add column if not exists organization_id uuid references public.organizations(id);
alter table public.audit_log add column if not exists organization_id uuid references public.organizations(id);

-- Assign legacy rows only if they have not been assigned already.
do $$
declare org uuid; tbl text;
begin
 select id into strict org from public.organizations where slug='seton-council';
 foreach tbl in array array[
  'financial_years','gl_codes','budgets','actuals','bank_transactions',
  'cheques','fundraisers','fundraiser_entries','budget_snapshots',
  'database_backups','import_runs','audit_log'
 ] loop
  execute format('update public.%I set organization_id=$1 where organization_id is null',tbl) using org;
 end loop;
end $$;

-- Tenant consistency constraints: existing rows must be fully tagged.
do $$
declare tbl text;
begin
 foreach tbl in array array[
  'financial_years','gl_codes','budgets','actuals','bank_transactions',
  'cheques','fundraisers','fundraiser_entries','budget_snapshots',
  'database_backups','import_runs','audit_log'
 ] loop
  execute format('alter table public.%I add constraint %I check (organization_id is not null) not valid',
   tbl,tbl||'_org_present');
  execute format('alter table public.%I validate constraint %I',tbl,tbl||'_org_present');
 end loop;
end $$;

-- Defaults temporarily keep the single-organization application working
-- while server-side tenant context and role checks are being built.
-- Defaults MUST be removed in the cutover migration.
do $$
declare tbl text; org uuid;
begin
 select id into strict org from public.organizations where slug='seton-council';
 foreach tbl in array array[
  'financial_years','gl_codes','budgets','actuals','bank_transactions',
  'cheques','fundraisers','fundraiser_entries','budget_snapshots',
  'database_backups','import_runs','audit_log'
 ] loop
  execute format('alter table public.%I alter column organization_id set default %L::uuid',tbl,org);
 end loop;
end $$;

create index if not exists financial_years_org_idx on public.financial_years(organization_id);
create index if not exists gl_codes_org_idx on public.gl_codes(organization_id);
create index if not exists budgets_org_idx on public.budgets(organization_id);
create index if not exists actuals_org_idx on public.actuals(organization_id);
create index if not exists bank_transactions_org_idx on public.bank_transactions(organization_id);
create index if not exists cheques_org_idx on public.cheques(organization_id);
create index if not exists fundraisers_org_idx on public.fundraisers(organization_id);
create index if not exists fundraiser_entries_org_idx on public.fundraiser_entries(organization_id);
create index if not exists budget_snapshots_org_idx on public.budget_snapshots(organization_id);
create index if not exists database_backups_org_idx on public.database_backups(organization_id);
create index if not exists import_runs_org_idx on public.import_runs(organization_id);
create index if not exists audit_log_org_idx on public.audit_log(organization_id);

-- Verify no row was dropped or left unassigned.
do $$
declare tbl text; missing bigint; wrong bigint; org uuid;
begin
 select id into strict org from public.organizations where slug='seton-council';
 foreach tbl in array array[
  'financial_years','gl_codes','budgets','actuals','bank_transactions',
  'cheques','fundraisers','fundraiser_entries','budget_snapshots',
  'database_backups','import_runs','audit_log'
 ] loop
  execute format('select count(*) from public.%I where organization_id is null',tbl) into missing;
  if missing>0 then raise exception '% has % unassigned records',tbl,missing; end if;
  execute format('select count(*) from public.%I where organization_id<>$1',tbl) into wrong using org;
  if wrong>0 then raise exception '% has % unexpected non-Seton records',tbl,wrong; end if;
 end loop;
end $$;
commit;
