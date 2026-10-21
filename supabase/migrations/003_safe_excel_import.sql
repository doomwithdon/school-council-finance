-- Safe atomic Excel import infrastructure
create table if not exists public.import_runs(
 id uuid primary key default gen_random_uuid(),
 financial_year_id uuid not null references public.financial_years(id),
 file_name text,
 file_fingerprint text not null,
 mode text not null check(mode in ('replace','merge')),
 status text not null default 'completed',
 counts jsonb not null default '{}'::jsonb,
 totals jsonb not null default '{}'::jsonb,
 warnings jsonb not null default '[]'::jsonb,
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists import_runs_year_created on public.import_runs(financial_year_id,created_at desc);
create unique index if not exists import_runs_fingerprint_replace on public.import_runs(financial_year_id,file_fingerprint,mode) where status='completed';

alter table public.import_runs enable row level security;
create policy "finance read import runs" on public.import_runs for select to authenticated using(public.my_role() in ('admin','treasurer'));
create policy "finance write import runs" on public.import_runs for all to authenticated using(public.can_write()) with check(public.can_write());

alter table public.actuals add column if not exists source_key text;
alter table public.bank_transactions add column if not exists source_key text;
alter table public.cheques add column if not exists source_key text;
create unique index if not exists actuals_year_source_unique on public.actuals(financial_year_id,source_key) where source_key is not null;
create unique index if not exists bank_year_source_unique on public.bank_transactions(financial_year_id,source_key) where source_key is not null;
create unique index if not exists cheques_year_source_unique on public.cheques(financial_year_id,source_key) where source_key is not null;

drop index if exists public.budget_snapshot_year_daily;
alter table public.budget_snapshots add column if not exists snapshot_kind text not null default 'manual';
create unique index if not exists budget_snapshot_daily_only on public.budget_snapshots(financial_year_id,snapshot_date) where snapshot_kind='daily';

create or replace function public.atomic_excel_import(
 p_financial_year uuid,p_user uuid,p_file_name text,p_fingerprint text,p_mode text,
 p_gl_codes jsonb,p_budgets jsonb,p_actuals jsonb,p_bank jsonb,p_cheques jsonb,
 p_counts jsonb,p_totals jsonb,p_warnings jsonb
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare rid uuid; fy public.financial_years%rowtype; old_budget jsonb; backup_payload jsonb;
begin
 if p_mode not in ('replace','merge') then raise exception 'invalid import mode'; end if;
 select * into fy from financial_years where id=p_financial_year;
 if not found then raise exception 'financial year not found'; end if;
 if exists(select 1 from import_runs where financial_year_id=p_financial_year and file_fingerprint=p_fingerprint and mode=p_mode and status='completed')
 then raise exception 'this workbook has already been imported into this financial year in % mode',p_mode; end if;

 insert into gl_codes(code,description)
 select x.code,x.description from jsonb_to_recordset(p_gl_codes) x(code text,description text)
 where x.code is not null and x.description is not null
 on conflict(code) do update set description=excluded.description;

 if exists(
   select 1 from jsonb_to_recordset(p_budgets) x(gl_code text) left join gl_codes g on g.code=x.gl_code where g.code is null
 ) or exists(
   select 1 from jsonb_to_recordset(p_actuals) x(gl_code text) left join gl_codes g on g.code=x.gl_code where x.gl_code is not null and g.code is null
 ) or exists(
   select 1 from jsonb_to_recordset(p_bank) x(gl_code text) left join gl_codes g on g.code=x.gl_code where x.gl_code is not null and g.code is null
 ) or exists(
   select 1 from jsonb_to_recordset(p_cheques) x(gl_code text) left join gl_codes g on g.code=x.gl_code where x.gl_code is not null and g.code is null
 ) then raise exception 'import contains unknown GL codes'; end if;

 if p_mode='replace' then
   select coalesce(jsonb_agg(to_jsonb(b) order by b.gl_code),'[]'::jsonb) into old_budget from budgets b where financial_year_id=p_financial_year;
   backup_payload=jsonb_build_object(
     'version',2,'type','pre_excel_replace','financial_year',to_jsonb(fy),'created_at',now(),
     'tables',jsonb_build_object(
       'budgets',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from budgets t where financial_year_id=p_financial_year),
       'actuals',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from actuals t where financial_year_id=p_financial_year),
       'bank_transactions',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from bank_transactions t where financial_year_id=p_financial_year),
       'cheques',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from cheques t where financial_year_id=p_financial_year),
       'fundraisers',(select coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) from fundraisers t where financial_year_id=p_financial_year)
     )
   );
   insert into database_backups(label,created_by,payload) values('Automatic backup before Excel replace of '||fy.label,p_user,backup_payload);
   insert into budget_snapshots(snapshot_date,label,created_by,financial_year_id,data,snapshot_kind)
   values(current_date,'Pre-import '||fy.label,p_user,p_financial_year,old_budget,'pre_import');
   delete from cheques where financial_year_id=p_financial_year;
   delete from bank_transactions where financial_year_id=p_financial_year;
   delete from actuals where financial_year_id=p_financial_year;
   delete from budgets where financial_year_id=p_financial_year;
 end if;

 insert into budgets(gl_code,amount,comments,prior_budget,prior_actual,financial_year_id)
 select x.gl_code,x.amount,x.comments,x.prior_budget,x.prior_actual,p_financial_year
 from jsonb_to_recordset(p_budgets) x(gl_code text,amount numeric,comments text,prior_budget numeric,prior_actual numeric)
 on conflict(financial_year_id,gl_code) do update set amount=excluded.amount,comments=excluded.comments,prior_budget=excluded.prior_budget,prior_actual=excluded.prior_actual,updated_at=now();

 insert into actuals(date,gl_code,amount,description,school_month,financial_year_id,source_key)
 select x.date,x.gl_code,x.amount,x.description,x.school_month,p_financial_year,x.source_key
 from jsonb_to_recordset(p_actuals) x(date date,gl_code text,amount numeric,description text,school_month int,source_key text)
 on conflict(financial_year_id,source_key) where source_key is not null do nothing;

 insert into bank_transactions(date,transaction,withdrawal,deposit,balance,gl_code,description,amount,financial_year_id,source_key)
 select x.date,x.transaction,x.withdrawal,x.deposit,x.balance,x.gl_code,x.description,x.amount,p_financial_year,x.source_key
 from jsonb_to_recordset(p_bank) x(date date,transaction text,withdrawal numeric,deposit numeric,balance numeric,gl_code text,description text,amount numeric,source_key text)
 on conflict(financial_year_id,source_key) where source_key is not null do nothing;

 insert into cheques(cheque_no,gl_code,amount,cheque_date,cleared_date,vendor,description,invoice_no,financial_year_id,source_key)
 select x.cheque_no,x.gl_code,x.amount,x.cheque_date,x.cleared_date,x.vendor,x.description,x.invoice_no,p_financial_year,x.source_key
 from jsonb_to_recordset(p_cheques) x(cheque_no text,gl_code text,amount numeric,cheque_date date,cleared_date date,vendor text,description text,invoice_no text,source_key text)
 on conflict(financial_year_id,source_key) where source_key is not null do nothing;

 insert into import_runs(financial_year_id,file_name,file_fingerprint,mode,counts,totals,warnings,created_by)
 values(p_financial_year,p_file_name,p_fingerprint,p_mode,p_counts,p_totals,p_warnings,p_user) returning id into rid;
 insert into audit_log(user_id,action,entity,entity_id,after_data)
 values(p_user,'excel_import','import_run',rid::text,jsonb_build_object('financial_year',fy.label,'mode',p_mode,'counts',p_counts,'totals',p_totals,'file_name',p_file_name));
 return rid;
end $$;
revoke all on function public.atomic_excel_import(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.atomic_excel_import(uuid,uuid,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb) to service_role;
