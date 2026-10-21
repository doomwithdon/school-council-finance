-- Allow a financial year to close into an already-created next year.
create or replace function public.close_financial_year(p_year uuid,p_next_label text,p_next_start date,p_next_end date) returns uuid
language plpgsql security definer set search_path=public as $$
declare
 closing numeric(12,2);
 next_id uuid;
 opening numeric(12,2);
 deposits numeric(12,2);
 withdrawals numeric(12,2);
 current_label text;
 current_status text;
 expected_next text;
begin
 if not public.is_admin() then raise exception 'admin required'; end if;
 select label,status,opening_carry_forward into current_label,current_status,opening from financial_years where id=p_year for update;
 if not found then raise exception 'financial year not found'; end if;
 if current_status<>'open' then raise exception 'year already closed'; end if;

 expected_next := split_part(current_label,'-',2)||'-'||((split_part(current_label,'-',2)::int)+1)::text;
 if p_next_label<>expected_next then raise exception 'next financial year must be %',expected_next; end if;

 select coalesce(sum(deposit),0),coalesce(sum(withdrawal),0)
 into deposits,withdrawals from bank_transactions where financial_year_id=p_year;
 closing:=coalesce(opening,0)+deposits-withdrawals;

 select id into next_id from financial_years where label=p_next_label for update;
 if next_id is null then
   insert into financial_years(label,start_date,end_date,opening_carry_forward)
   values(p_next_label,p_next_start,p_next_end,closing) returning id into next_id;
 else
   update financial_years set opening_carry_forward=closing where id=next_id;
 end if;

 update financial_years
 set closing_surplus_deficit=closing,status='closed',closed_at=now(),closed_by=auth.uid()
 where id=p_year;

 insert into audit_log(user_id,action,entity,entity_id,after_data)
 values(auth.uid(),'close_year','financial_year',p_year::text,
   jsonb_build_object('closing_surplus_deficit',closing,'next_year_id',next_id,'next_year_label',p_next_label,'carry_forward_updated',true));
 return next_id;
end $$;
