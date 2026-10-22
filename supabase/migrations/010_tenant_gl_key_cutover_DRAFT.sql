-- Stage 2H DRAFT: tenant-specific GL code key transition.
-- REQUIRES 006-008. DO NOT RUN until every finance route, RPC, import,
-- restore and GL admin action has been upgraded and tested.
-- Explicitly gated: no schema changes without a reviewed cutover.
begin;
do $$
begin
 if current_setting('app.enable_gl_key_cutover',true) is distinct from 'approved'
 then raise exception 'GL key cutover blocked: tenant-aware application and RPCs required'; end if;
end $$;

-- Current schema uses gl_codes(code) as a globally unique primary key.
-- Foreign keys referencing it must be removed before changing the key.
-- Tenant-scoped foreign keys preserve GL integrity across organizations.
do $$
declare t text; fk record;
begin
 foreach t in array array['budgets','actuals','bank_transactions','cheques','fundraiser_entries'] loop
  for fk in
   select c.conname
   from pg_constraint c
   join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
   where c.conrelid=format('public.%I',t)::regclass and c.contype='f'
     and c.confrelid='public.gl_codes'::regclass and a.attname='gl_code'
  loop
   execute format('alter table public.%I drop constraint %I',t,fk.conname);
  end loop;
 end loop;
end $$;

alter table public.gl_codes drop constraint gl_codes_pkey;
alter table public.gl_codes add constraint gl_codes_pkey primary key(organization_id,code);

do $$
declare t text;
begin
 foreach t in array array['budgets','actuals','bank_transactions','cheques','fundraiser_entries'] loop
  execute format(
   'alter table public.%I add constraint %I foreign key(organization_id,gl_code) references public.gl_codes(organization_id,code) on update restrict on delete restrict',
   t,t||'_org_gl_fkey'
  );
 end loop;
end $$;

-- This key change requires modifying old INSERT .. ON CONFLICT(code)
-- statements to ON CONFLICT(organization_id,code) before activation.
commit;
