// Static safety regression checks. Run: npm run test:tenant-guards
// These checks do not replace integration tests against a migrated staging DB.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {readFileSync}=require("node:fs");
const read=p=>readFileSync(p,"utf8");
test("legacy importer remains disabled during tenant cutover",()=>{
 const s=read("app/api/import/route.ts");
 assert.match(s,/if\(multiOrgEnabled\(\)\)return NextResponse\.json\(/);
 assert.match(s,/status:503/);
 assert.match(s,/session\.auth\.getUser\(\)/);
});
test("tenant preflight never uses privileged DB or writes",()=>{
 const s=read("app/api/import/preflight/route.ts");
 assert.match(s,/getOrganizationContext\(user\.id\)/);
 assert.match(s,/\.eq\("organization_id",context\.active\.id\)/);
 assert.match(s,/writeEnabled:false/);
 assert.doesNotMatch(s,/supabase-admin|admin\(\)|\.insert\(|\.update\(|\.delete\(|\.rpc\(/);
});
test("draft importer is gated and tenant-bound",()=>{
 const s=read("supabase/migrations/011_tenant_atomic_import_DRAFT.sql");
 assert.match(s,/app\.enable_tenant_import_cutover/);
 assert.match(s,/organization_memberships/);
 assert.match(s,/where id=p_financial_year and organization_id=p_organization/);
 for(const t of ["budgets","actuals","bank_transactions","cheques"]){
  assert.match(s,new RegExp("delete from "+t+" where financial_year_id=p_financial_year and organization_id=p_organization"));
 }
 assert.match(s,/on conflict\(organization_id,code\)/);
});
test("tenant GL migration remains approval gated",()=>{
 const s=read("supabase/migrations/010_tenant_gl_key_cutover_DRAFT.sql");
 assert.match(s,/app\.enable_gl_key_cutover/);
 assert.match(s,/foreign key\(organization_id,gl_code\)/);
});

test("user administration remains disabled and GL actions are tenant scoped",()=>{
 const users=read("app/users/actions.ts");
 for(const name of ["addUser","updateUser","resetPassword","deleteUser"]){
  const start=users.indexOf("export async function "+name+"(");
  assert.ok(start>=0);
  assert.match(users.slice(start,start+250),/if\\(multiOrgEnabled\\(\\)\\)throw new Error\\(/);
 }
 const gl=read("app/gl-codes/actions.ts");
 assert.match(gl,/organization_id:org/);
 assert.match(gl,/eq\\("organization_id",org\\)/);
 const page=read("app/gl-codes/page.tsx");
 assert.match(page,/eq\\("organization_id",organization.id\\)/);
 const members=read("app/users/page.tsx");
 assert.match(members,/if\\(multiOrgEnabled\\(\\)\\)/);
});
test("tenant import backups never copy another council's fundraisers",()=>{
 const s=read("supabase/migrations/011_tenant_atomic_import_DRAFT.sql");
 assert.match(s,/from fundraisers t where financial_year_id=p_financial_year and organization_id=p_organization/);
});
test("financial year labels can be reused only across different councils after gated migration",()=>{
 const s=read("supabase/migrations/012_tenant_financial_year_keys_DRAFT.sql");
 assert.match(s,/app\.enable_tenant_year_key_cutover/);
 assert.match(s,/financial_years\(organization_id,label\)/);
});
