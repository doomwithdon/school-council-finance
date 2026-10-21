-- Correct the known 2024-2025 year boundary only when it still has the erroneous June 1 end date.
update public.financial_years
set end_date='2025-08-31'
where label='2024-2025'
  and start_date='2024-09-01'
  and end_date='2025-06-01';
