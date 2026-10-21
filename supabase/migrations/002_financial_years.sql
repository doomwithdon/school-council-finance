-- Multi-year accounting migration
create table if not exists public.financial_years(
 id uuid primary key default gen_random_uuid(),
 label text not null unique,
 start_date date not null,
 end_date date not null,
 opening_carry_forward numeric(12,2) not null default 0,
 closing_surplus_deficit numeric(12,2),
 status text not null default 'open' check(status in ('open','closed')),
 closed_at timestamptz,
 closed_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 check(end_date>start_date)
);
alter table public.financial_years enable row level security;
create policy "authenticated read financial years" on public.financial_years for select to authenticated using(true);
create policy "finance write financial years" on public.financial_years for all to authenticated using(public.can_write()) with check(public.can_write());

insert into public.financial_years(label,start_date,end_date)
values('2025-2026','2025-09-01','2026-08-31')
on conflict(label) do nothing;

alter table public.budgets add column if not exists financial_year_id uuid references public.financial_years(id);
alter table public.actuals add column if not exists financial_year_id uuid references public.financial_years(id);
alter table public.bank_transactions add column if not exists financial_year_id uuid references public.financial_years(id);
alter table public.cheques add column if not exists financial_year_id uuid references public.financial_years(id);
alter table public.fundraisers add column if not exists financial_year_id uuid references public.financial_years(id);
alter table public.budget_snapshots add column if not exists financial_year_id uuid references public.financial_years(id);

update public.budgets set financial_year_id=(select id from public.financial_years where label='2025-2026') where financial_year_id is null;
update public.actuals set financial_year_id=(select id from public.financial_years where label='2025-2026') where financial_year_id is null;
update public.bank_transactions set financial_year_id=(select id from public.financial_years where label='2025-2026') where financial_year_id is null;
update public.cheques set financial_year_id=(select id from public.financial_years where label='2025-2026') where financial_year_id is null;
update public.fundraisers set financial_year_id=(select id from public.financial_years where label='2025-2026') where financial_year_id is null;
update public.budget_snapshots set financial_year_id=(select id from public.financial_years where label='2025-2026') where financial_year_id is null;

alter table public.budgets drop constraint if exists budgets_gl_code_key;
drop index if exists public.budgets_gl_code_key;
create unique index if not exists budgets_year_gl_unique on public.budgets(financial_year_id,gl_code);
drop index if exists public.budget_snapshot_daily;
create unique index if not exists budget_snapshot_year_daily on public.budget_snapshots(financial_year_id,snapshot_date);

create or replace function public.make_budget_snapshot(p_label text default null,p_financial_year uuid default null) returns uuid language plpgsql security definer set search_path=public as $$
declare sid uuid; fy uuid;
begin
 if not public.can_write() then raise exception 'not authorized'; end if;
 fy:=coalesce(p_financial_year,(select id from financial_years where status='open' order by start_date desc limit 1));
 insert into budget_snapshots(snapshot_date,label,created_by,financial_year_id,data)
 values(current_date,p_label,auth.uid(),fy,(select coalesce(jsonb_agg(to_jsonb(b) order by b.gl_code),'[]'::jsonb) from budgets b where b.financial_year_id=fy))
 on conflict(financial_year_id,snapshot_date) do update set data=excluded.data,label=coalesce(excluded.label,budget_snapshots.label),created_by=excluded.created_by,created_at=now()
 returning id into sid; return sid;
end $$;

create or replace function public.restore_budget_snapshot(p_snapshot uuid) returns void language plpgsql security definer set search_path=public as $$
declare snap jsonb; fy uuid;
begin
 if not public.is_admin() then raise exception 'admin required'; end if;
 select data,financial_year_id into snap,fy from budget_snapshots where id=p_snapshot;
 if snap is null then raise exception 'snapshot not found'; end if;
 perform public.make_budget_snapshot('Automatic pre-restore snapshot',fy);
 delete from budgets where financial_year_id=fy;
 insert into budgets(id,gl_code,amount,comments,prior_budget,prior_actual,updated_at,financial_year_id)
 select x.id,x.gl_code,x.amount,x.comments,x.prior_budget,x.prior_actual,now(),fy
 from jsonb_to_recordset(snap) as x(id bigint,gl_code text,amount numeric,comments text,prior_budget numeric,prior_actual numeric,updated_at timestamptz,financial_year_id uuid);
 perform setval(pg_get_serial_sequence('budgets','id'),greatest(coalesce((select max(id) from budgets),1),1));
 insert into audit_log(user_id,action,entity,entity_id,after_data) values(auth.uid(),'restore','budget_snapshot',p_snapshot::text,jsonb_build_object('financial_year_id',fy,'restored_at',now()));
end $$;

create or replace function public.close_financial_year(p_year uuid,p_next_label text,p_next_start date,p_next_end date) returns uuid language plpgsql security definer set search_path=public as $$
declare closing numeric(12,2); next_id uuid; opening numeric(12,2); deposits numeric(12,2); withdrawals numeric(12,2);
begin
 if not public.is_admin() then raise exception 'admin required'; end if;
 if (select status from financial_years where id=p_year)<>'open' then raise exception 'year already closed'; end if;
 select opening_carry_forward into opening from financial_years where id=p_year;
 select coalesce(sum(deposit),0),coalesce(sum(withdrawal),0) into deposits,withdrawals from bank_transactions where financial_year_id=p_year;
 closing:=opening+deposits-withdrawals;
 update financial_years set closing_surplus_deficit=closing,status='closed',closed_at=now(),closed_by=auth.uid() where id=p_year;
 insert into financial_years(label,start_date,end_date,opening_carry_forward) values(p_next_label,p_next_start,p_next_end,closing) returning id into next_id;
 insert into audit_log(user_id,action,entity,entity_id,after_data) values(auth.uid(),'close_year','financial_year',p_year::text,jsonb_build_object('closing_surplus_deficit',closing,'next_year_id',next_id));
 return next_id;
end $$;
