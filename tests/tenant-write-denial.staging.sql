-- STAGING ONLY: negative RLS write test. No changes are committed.
-- Required psql variables: actor_a_uuid, org_b_uuid.
-- Run ONLY against disposable staging, using a DB role allowed to SET ROLE.
\set ON_ERROR_STOP on
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', :'actor_a_uuid', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('app.test_foreign_org', :'org_b_uuid', true);
do $$
declare blocked boolean := false;
begin
 begin
  insert into public.gl_codes(organization_id,code,description)
  values(current_setting('app.test_foreign_org')::uuid,
         '__tenant_denial_test__','Staging-only RLS denial probe');
 exception when insufficient_privilege then
  blocked := true;
 end;
 if not blocked then
  raise exception 'SECURITY FAILURE: cross-tenant GL code INSERT was permitted';
 end if;
end $$;
rollback;
