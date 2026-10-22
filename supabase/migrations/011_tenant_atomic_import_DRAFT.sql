-- DRAFT ONLY. Requires 006-010 and coordinated release review.
-- WARNING: service_role bypasses RLS; p_user is caller-supplied and must be
-- derived from a VERIFIED JWT on the server. Never expose this RPC to clients.
-- This draft is intentionally blocked by app.enable_tenant_import_cutover.
begin;
create or replace function public.atomic_excel_import_tenant_draft(
 p_organization uuid,p_financial_year uuid,p_user uuid,p_file_name text,p_fingerprint text,p_mode text,
 p_gl_codes jsonb,p_budgets jsonb,p_actuals jsonb,p_bank jsonb,p_cheques jsonb,
 p_counts jsonb,p_totals jsonb,p_warnings jsonb
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare rid uuid; fy public.financial_years%rowtype; old_budget jsonb; backup_payload jsonb;
begin
 if current_setting('app.enable_tenant_import_cutover',true) is distinct from 'approved'
 then raise exception 'Tenant importer not approved for execution'; end if;
 if p_organization is null or p_user is null then raise exception 'Missing organization or actor'; end if;
 if not exists(
   select 1 from public.organization_memberships m
   join public.organizations o on o.id=m.organization_id
   where m.organization_id=p_organization and m.user_id=p_user
     and m.role in ('admin','treasurer') and o.status='active'
 ) then raise exception 'Not authorized for organization'; end if;
 if p_mode not in ('replace','merge') then raise exception 'invalid import mode'; end if;
 select * into fy from financial_years where id=p_financial_year and organization_id=p_organization;
 if not found then raise exception 'financial year not found'; end if;
 if exists(select 1 from import_runs where financial_year_id=p_financial_year and organization_id=p_organization and file_fingerprint=p_fingerprint and mode=p_mode and status='completed')
 then raise exception 'this workbook has already been imported into this financial year in % mode',p_mode; end if;

 insert into gl_codes(organization_id,code,description)
 select p_organization,x.code,x.description from jsonb_to_recordset(p_gl_codes) x(code text,description text)
 where x.code is not null and x.description is not null
 on conflict(organization_id,code) do update set description=excluded.description;

 if exists(
   select 1 from jsonb_to_recordset(p_budgets) x(gl_code text) left join gl_codes g on g.code=x.gl_code and g.organization_id=p_organization where g.code is null
 ) or exists(
   select 1 from jsonb_to_recordset(p_actuals) x(gl_code text) left join gl_codes g on g.code=x.gl_code and g.organization_id=p_organization where x.gl_code is not null and g.code is null
 ) or exists(
   select 1 from jsonb_to_recordset(p_bank) x(gl_code text) left join gl_codes g on g.code=x.gl_code and g.organization_id=p_organization where x.gl_code is not null and g.code is null
 ) or exists(
   select 1 from jsonb_to_recordset(p_cheques) x(gl_code text) left join gl_codes g on g.code=x.gl_code and g.organization_id=p_organization where x.gl_code is not null and g.code is null
 ) then raise exception 'import contains unknown GL codes'; end if;

 if p_mode='replace' then
   select coalesce(jsonb_agg(to_jsonb(b) order by b.gl_code),'[]'::jsonb) into old_budget from budgets b where financial_year_id=p_financial_year and organization_id=p_organization;
   backup_payload=jsonb_build_object(
     'version',2,'type','pre_excel_replace','financial_year',to_jsonb(fy),'created_at',now(),
     'tables',jsonb_build_object(
       'budgets',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from budgets t where financial_year_id=p_financial_year and organization_id=p_organization),
       'actuals',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from actuals t where financial_year_id=p_financial_year and organization_id=p_organization),
       'bank_transactions',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from bank_transactions t where financial_year_id=p_financial_year and organization_id=p_organization),
       'cheques',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from cheques t where financial_year_id=p_financial_year and organization_id=p_organization),
       'fundraisers',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from fundraisers t where financial_year_id=p_financial_year)
     )
   );
   insert into database_backups(organization_id,label,created_by,payload) values(p_organization,'Automatic backup before Excel replace of '||fy.label,p_user,backup_payload);
   insert into budget_snapshots(organization_id,snapshot_date,label,created_by,financial_year_id,data,snapshot_kind)
   values(p_organization,current_date,'Pre-import '||fy.label,p_user,p_financial_year,old_budget,'pre_import');
   delete from cheques where financial_year_id=p_financial_year and organization_id=p_organization;
   delete from bank_transactions where financial_year_id=p_financial_year and organization_id=p_organization;
   delete from actuals where financial_year_id=p_financial_year and organization_id=p_organization;
   delete from budgets where financial_year_id=p_financial_year and organization_id=p_organization;
 end if;

 insert into budgets(organization_id,gl_code,amount,comments,prior_budget,prior_actual,financial_year_id)
 select p_organization,x.gl_code,x.amount,x.comments,x.prior_budget,x.prior_actual,p_financial_year
 from jsonb_to_recordset(p_budgets) x(gl_code text,amount numeric,comments text,prior_budget numeric,prior_actual numeric)
 on conflict(financial_year_id,gl_code) do update set amount=excluded.amount,comments=excluded.comments,prior_budget=excluded.prior_budget,prior_actual=excluded.prior_actual,updated_at=now();

 insert into actuals(organization_id,date,gl_code,amount,description,school_month,financial_year_id,source_key)
 select p_organization,x.date,x.gl_code,x.amount,x.description,x.school_month,p_financial_year,x.source_key
 from jsonb_to_recordset(p_actuals) x(date date,gl_code text,amount numeric,description text,school_month int,source_key text)
 on conflict(financial_year_id,source_key) where source_key is not null do nothing;

 insert into bank_transactions(organization_id,date,transaction,withdrawal,deposit,balance,gl_code,description,amount,financial_year_id,source_key)
 select p_organization,x.date,x.transaction,x.withdrawal,x.deposit,x.balance,x.gl_code,x.description,x.amount,p_financial_year,x.source_key
 from jsonb_to_recordset(p_bank) x(date date,transaction text,withdrawal numeric,deposit numeric,balance numeric,gl_code text,description text,amount numeric,source_key text)
 on conflict(financial_year_id,source_key) where source_key is not null do nothing;

 insert into cheques(organization_id,cheque_no,gl_code,amount,cheque_date,cleared_date,vendor,description,invoice_no,financial_year_id,source_key)
 select p_organization,x.cheque_no,x.gl_code,x.amount,x.cheque_date,x.cleared_date,x.vendor,x.description,x.invoice_no,p_financial_year,x.source_key
 from jsonb_to_recordset(p_cheques) x(cheque_no text,gl_code text,amount numeric,cheque_date date,cleared_date date,vendor text,description text,invoice_no text,source_key text)
 on conflict(financial_year_id,source_key) where source_key is not null do nothing;

 if p_mode='replace' then
   if (select count(*) from budgets where financial_year_id=p_financial_year and organization_id=p_organization)<>(p_counts->>'budgets')::int
      or (select count(*) from actuals where financial_year_id=p_financial_year and organization_id=p_organization)<>(p_counts->>'actuals')::int
      or (select count(*) from bank_transactions where financial_year_id=p_financial_year and organization_id=p_organization)<>(p_counts->>'bankTransactions')::int
      or (select count(*) from cheques where financial_year_id=p_financial_year and organization_id=p_organization)<>(p_counts->>'cheques')::int
      or round(coalesce((select sum(amount) from budgets where financial_year_id=p_financial_year and organization_id=p_organization),0),2)<>round((p_totals->>'budget')::numeric,2)
      or round(coalesce((select sum(amount) from actuals where financial_year_id=p_financial_year and organization_id=p_organization),0),2)<>round((p_totals->>'actual')::numeric,2)
      or round(coalesce((select sum(deposit) from bank_transactions where financial_year_id=p_financial_year and organization_id=p_organization),0),2)<>round((p_totals->>'deposits')::numeric,2)
      or round(coalesce((select sum(withdrawal) from bank_transactions where financial_year_id=p_financial_year and organization_id=p_organization),0),2)<>round((p_totals->>'withdrawals')::numeric,2)
      or round(coalesce((select sum(amount) from cheques where financial_year_id=p_financial_year and organization_id=p_organization),0),2)<>round((p_totals->>'cheques')::numeric,2)
   then raise exception 'post-import reconciliation failed; transaction rolled back'; end if;
 end if;

 insert into import_runs(organization_id,financial_year_id,file_name,file_fingerprint,mode,counts,totals,warnings,created_by)
 values(p_organization,p_financial_year,p_file_name,p_fingerprint,p_mode,p_counts,p_totals,p_warnings,p_user) returning id into rid;
 insert into audit_log(organization_id,user_id,action,entity,entity_id,after_data)
 values(p_organization,p_user,'excel_import','import_run',rid::text,jsonb_build_object('financial_year',fy.label,'mode',p_mode,'counts',p_counts,'totals',p_totals,'file_name',p_file_name));
 return rid;
end $$;

revoke all on function public.atomic_excel_import_tenant_draft(uuid,uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.atomic_excel_import_tenant_draft(uuid,uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;
commit;
