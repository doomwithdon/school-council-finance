-- STAGE 2C / CUTOVER-ONLY: Organization-aware authorization and RLS.
-- REQUIRES 006, 007, 008. DO NOT APPLY TO THE CURRENT SINGLE-TENANT APP.
-- Deploy only together with tenant-aware application, RPCs, import/restore and tests.
-- This migration intentionally FAILS until the final release gate is explicitly enabled.
begin;

do $$
begin
 if current_setting('app.enable_tenant_cutover', true) is distinct from 'approved'
 then raise exception 'TENANT CUTOVER BLOCKED: requires reviewed application, RPC, import and backup changes and staging isolation tests'; end if;
end $$;

alter table public.profiles
 add column if not exists active_organization_id uuid references public.organizations(id);

update public.profiles p
set active_organization_id=o.id
from public.organizations o
where o.slug='seton-council' and p.active_organization_id is null;

create or replace function public.active_organization()
returns uuid language sql stable security definer set search_path=public
as $$
 select p.active_organization_id
 from public.profiles p
 join public.organization_memberships m
   on m.organization_id=p.active_organization_id and m.user_id=p.id
 join public.organizations o on o.id=m.organization_id and o.status='active'
 where p.id=auth.uid()
$$;

create or replace function public.organization_role(p_org uuid)
returns public.app_role language sql stable security definer set search_path=public
as $$
 select m.role from public.organization_memberships m
 join public.organizations o on o.id=m.organization_id and o.status='active'
 where m.user_id=auth.uid() and m.organization_id=p_org
$$;

create or replace function public.can_read_organization(p_org uuid)
returns boolean language sql stable security definer set search_path=public
as $$
 select p_org is not null and p_org=public.active_organization()
 and public.organization_role(p_org) is not null
$$;

create or replace function public.can_write_organization(p_org uuid)
returns boolean language sql stable security definer set search_path=public
as $$
 select public.can_read_organization(p_org)
 and public.organization_role(p_org) in ('admin','treasurer')
$$;

create or replace function public.can_admin_organization(p_org uuid)
returns boolean language sql stable security definer set search_path=public
as $$
 select public.can_read_organization(p_org)
 and public.organization_role(p_org)='admin'
$$;

-- Keep legacy authorization helpers aligned to selected organization.
create or replace function public.my_role()
returns public.app_role language sql stable security definer set search_path=public
as $$ select coalesce(public.organization_role(public.active_organization()),'council'::public.app_role) $$;
create or replace function public.can_write()
returns boolean language sql stable security definer set search_path=public
as $$ select public.can_write_organization(public.active_organization()) $$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select public.can_admin_organization(public.active_organization()) $$;

-- Only authenticated members can change their own selected organization.
create or replace function public.switch_organization(p_organization_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
 if auth.uid() is null then raise exception 'Not authenticated'; end if;
 if not exists (
  select 1 from public.organization_memberships m
  join public.organizations o on o.id=m.organization_id
  where m.user_id=auth.uid() and m.organization_id=p_organization_id and o.status='active'
 ) then raise exception 'Organization access denied'; end if;
 update public.profiles set active_organization_id=p_organization_id where id=auth.uid();
 if not found then raise exception 'Profile not found'; end if;
end $$;

revoke all on function public.switch_organization(uuid) from public,anon;
grant execute on function public.switch_organization(uuid) to authenticated;

-- Remove permissive policies (Postgres OR-combines policies).
do $$
declare t text; pol record;
begin
 foreach t in array array[
  'financial_years','gl_codes','budgets','actuals','bank_transactions',
  'cheques','fundraisers','fundraiser_entries','budget_snapshots',
  'database_backups','import_runs','audit_log'
 ] loop
  for pol in select policyname from pg_policies where schemaname='public' and tablename=t loop
   execute format('drop policy %I on public.%I',pol.policyname,t);
  end loop;
  execute format('alter table public.%I enable row level security',t);
  execute format(
   'create policy %I on public.%I for select to authenticated using (public.can_read_organization(organization_id))',
   t||'_tenant_read',t
  );
  if t not in ('audit_log','database_backups','import_runs','budget_snapshots') then
   execute format(
    'create policy %I on public.%I for insert to authenticated with check (public.can_write_organization(organization_id))',
    t||'_tenant_insert',t
   );
   execute format(
    'create policy %I on public.%I for update to authenticated using (public.can_write_organization(organization_id)) with check (public.can_write_organization(organization_id))',
    t||'_tenant_update',t
   );
   execute format(
    'create policy %I on public.%I for delete to authenticated using (public.can_write_organization(organization_id))',
    t||'_tenant_delete',t
   );
  end if;
 end loop;
end $$;

-- Audit log is append-only; organization members can see their own tenant's log.
create policy audit_tenant_insert on public.audit_log for insert to authenticated
 with check(public.can_write_organization(organization_id) and user_id=auth.uid());

-- Snapshots are immutable from direct client writes, except inserts.
create policy snapshot_tenant_insert on public.budget_snapshots for insert to authenticated
 with check(public.can_write_organization(organization_id));

-- Backups: only tenant finance staff can read/create, admins can delete.
drop policy database_backups_tenant_read on public.database_backups;
create policy database_backups_tenant_read on public.database_backups for select to authenticated
 using(public.can_write_organization(organization_id));
create policy database_backups_tenant_insert on public.database_backups for insert to authenticated
 with check(public.can_write_organization(organization_id));
create policy database_backups_tenant_delete on public.database_backups for delete to authenticated
 using(public.can_admin_organization(organization_id));

-- Imports: finance staff can read history; privileged importer must validate tenant separately.
drop policy import_runs_tenant_read on public.import_runs;
create policy import_runs_tenant_read on public.import_runs for select to authenticated
 using(public.can_write_organization(organization_id));

-- Do not allow direct edits to organization IDs after insertion.
-- Requires privileged tenant-aware restore/import RPCs at cutover.
create or replace function public.reject_finance_tenant_reassignment()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.organization_id is distinct from old.organization_id
 then raise exception 'Cannot transfer a financial record between organizations'; end if;
 return new;
end $$;
do $$
declare t text;
begin
 foreach t in array array[
  'financial_years','gl_codes','budgets','actuals','bank_transactions',
  'cheques','fundraisers','fundraiser_entries','budget_snapshots',
  'database_backups','import_runs','audit_log'
 ] loop
  execute format('drop trigger if exists %I on public.%I',t||'_tenant_immutable',t);
  execute format('create trigger %I before update on public.%I for each row execute function public.reject_finance_tenant_reassignment()',t||'_tenant_immutable',t);
 end loop;
end $$;

-- Defaults installed by 007 must not silently assign new rows to Seton.
do $$
declare t text;
begin
 foreach t in array array[
  'financial_years','gl_codes','budgets','actuals','bank_transactions',
  'cheques','fundraisers','fundraiser_entries','budget_snapshots',
  'database_backups','import_runs','audit_log'
 ] loop
  execute format('alter table public.%I alter column organization_id drop default',t);
 end loop;
end $$;

commit;
