-- Stage 2B: validate and enforce organization consistency for accounting references.
-- Requires migrations 006 and 007. Does NOT enable multi-tenant access.
-- No existing records are deleted or rewritten. Safe to review in staging first.
begin;

-- Indexes required for future composite foreign keys. Existing global keys remain.
create unique index if not exists financial_years_org_id_unique
  on public.financial_years(organization_id,id);
create unique index if not exists gl_codes_org_code_unique
  on public.gl_codes(organization_id,code);
create unique index if not exists fundraisers_org_id_unique
  on public.fundraisers(organization_id,id);
create unique index if not exists budget_snapshots_org_id_unique
  on public.budget_snapshots(organization_id,id);
create unique index if not exists import_runs_org_id_unique
  on public.import_runs(organization_id,id);

-- Refuse inconsistent links even when callers have elevated SQL permissions.
-- NULL GLs remain valid on tables where the legacy schema permits them.
create or replace function public.assert_finance_tenant_links()
returns trigger language plpgsql security invoker set search_path=public as $$
declare linked_org uuid;
begin
 if new.organization_id is null then
  raise exception 'organization_id is required for %',TG_TABLE_NAME;
 end if;

 if TG_TABLE_NAME in (
  'budgets','actuals','bank_transactions','cheques','fundraisers',
  'budget_snapshots','import_runs'
 ) then
  if new.financial_year_id is not null then
   select organization_id into linked_org
   from public.financial_years where id=new.financial_year_id;
   if linked_org is distinct from new.organization_id then
    raise exception 'Financial year belongs to another organization';
   end if;
  end if;
 end if;

 if TG_TABLE_NAME in (
  'budgets','actuals','bank_transactions','cheques','fundraiser_entries'
 ) then
  if new.gl_code is not null then
   select organization_id into linked_org
   from public.gl_codes where code=new.gl_code;
   if linked_org is distinct from new.organization_id then
    raise exception 'GL code belongs to another organization';
   end if;
  end if;
 end if;

 if TG_TABLE_NAME='fundraiser_entries' then
  select organization_id into linked_org
  from public.fundraisers where id=new.fundraiser_id;
  if linked_org is distinct from new.organization_id then
   raise exception 'Fundraiser belongs to another organization';
  end if;
 end if;
 return new;
end $$;

do $$
declare t text;
begin
 foreach t in array array[
  'budgets','actuals','bank_transactions','cheques','fundraisers',
  'fundraiser_entries','budget_snapshots','import_runs'
 ] loop
  execute format('drop trigger if exists %I on public.%I',t||'_tenant_links',t);
  execute format(
   'create trigger %I before insert or update on public.%I for each row execute function public.assert_finance_tenant_links()',
   t||'_tenant_links',t
  );
 end loop;
end $$;

-- Validate existing links before commit, including records inserted after 007.
do $$
declare bad bigint;
begin
 select count(*) into bad
 from public.budgets b
 left join public.financial_years y on y.id=b.financial_year_id
 left join public.gl_codes g on g.code=b.gl_code
 where (b.financial_year_id is not null and y.organization_id is distinct from b.organization_id)
    or g.organization_id is distinct from b.organization_id;
 if bad>0 then raise exception 'Budget tenant links invalid: %',bad; end if;

 select count(*) into bad from public.actuals a
 left join public.financial_years y on y.id=a.financial_year_id
 left join public.gl_codes g on g.code=a.gl_code
 where (a.financial_year_id is not null and y.organization_id is distinct from a.organization_id)
    or (a.gl_code is not null and g.organization_id is distinct from a.organization_id);
 if bad>0 then raise exception 'Actual tenant links invalid: %',bad; end if;

 select count(*) into bad from public.bank_transactions a
 left join public.financial_years y on y.id=a.financial_year_id
 left join public.gl_codes g on g.code=a.gl_code
 where (a.financial_year_id is not null and y.organization_id is distinct from a.organization_id)
    or (a.gl_code is not null and g.organization_id is distinct from a.organization_id);
 if bad>0 then raise exception 'Bank transaction tenant links invalid: %',bad; end if;

 select count(*) into bad from public.cheques a
 left join public.financial_years y on y.id=a.financial_year_id
 left join public.gl_codes g on g.code=a.gl_code
 where (a.financial_year_id is not null and y.organization_id is distinct from a.organization_id)
    or (a.gl_code is not null and g.organization_id is distinct from a.organization_id);
 if bad>0 then raise exception 'Cheque tenant links invalid: %',bad; end if;

 select count(*) into bad from public.fundraisers a
 left join public.financial_years y on y.id=a.financial_year_id
 where a.financial_year_id is not null and y.organization_id is distinct from a.organization_id;
 if bad>0 then raise exception 'Fundraiser tenant links invalid: %',bad; end if;

 select count(*) into bad from public.fundraiser_entries a
 left join public.fundraisers f on f.id=a.fundraiser_id
 left join public.gl_codes g on g.code=a.gl_code
 where f.organization_id is distinct from a.organization_id
    or (a.gl_code is not null and g.organization_id is distinct from a.organization_id);
 if bad>0 then raise exception 'Fundraiser entry tenant links invalid: %',bad; end if;

 select count(*) into bad from public.budget_snapshots a
 left join public.financial_years y on y.id=a.financial_year_id
 where a.financial_year_id is not null and y.organization_id is distinct from a.organization_id;
 if bad>0 then raise exception 'Snapshot tenant links invalid: %',bad; end if;

 select count(*) into bad from public.import_runs a
 left join public.financial_years y on y.id=a.financial_year_id
 where y.organization_id is distinct from a.organization_id;
 if bad>0 then raise exception 'Import run tenant links invalid: %',bad; end if;
end $$;

commit;
