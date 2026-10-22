-- Stage 1: multi-organization identity foundation ONLY.
-- This does NOT enable multi-tenant accounting or change existing finance RLS.
-- Do not create additional live organizations until the isolation migration is deployed.
begin;
create table if not exists public.organizations (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 name text not null check(length(trim(name))>0),
 status text not null default 'active' check(status in ('active','suspended')),
 created_at timestamptz not null default now(),
 created_by uuid references auth.users(id)
);
create table if not exists public.organization_memberships (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role public.app_role not null,
 created_at timestamptz not null default now(),
 primary key(organization_id,user_id)
);
create index if not exists organization_memberships_user_idx on public.organization_memberships(user_id);
create table if not exists public.platform_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.platform_admins enable row level security;
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.platform_admins where user_id=auth.uid()) $$;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_platform_admin() to authenticated;
create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path=public
as $$ select exists(select 1 from public.organization_memberships where organization_id=p_org and user_id=auth.uid()) $$;
revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
create policy "members see their organizations" on public.organizations
 for select to authenticated using(public.is_platform_admin() or public.is_org_member(id));
create policy "platform admins manage organizations" on public.organizations
 for all to authenticated using(public.is_platform_admin()) with check(public.is_platform_admin());
create policy "members see same organization memberships" on public.organization_memberships
 for select to authenticated using(public.is_platform_admin() or public.is_org_member(organization_id));
-- No direct membership mutations: these will be performed by validated RPCs in stage 2.
create policy "platform admin view" on public.platform_admins
 for select to authenticated using(public.is_platform_admin());
-- Preserve existing school council and all its current users.
insert into public.organizations(slug,name)
values('seton-council','St. Elizabeth Seton School Council')
on conflict(slug) do nothing;
insert into public.organization_memberships(organization_id,user_id,role)
select o.id,p.id,p.role
from public.organizations o cross join public.profiles p
where o.slug='seton-council'
on conflict(organization_id,user_id) do nothing;
-- Bootstrap platform administrators explicitly after reviewing existing admin identities.
-- Example (replace UUID only after verification):
-- insert into public.platform_admins(user_id) values ('verified-admin-uuid');
commit;
