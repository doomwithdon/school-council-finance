// Staging-only, read-only tenant isolation smoke test.
// Required: STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY,
// STAGING_COUNCIL_A_EMAIL, STAGING_COUNCIL_A_PASSWORD,
// STAGING_COUNCIL_B_EMAIL, STAGING_COUNCIL_B_PASSWORD.
// Both accounts must belong to distinct active organizations and have
// active_organization_id set. Never use service-role credentials here.
const {test}=require("node:test");
const assert=require("node:assert/strict");
const {createClient}=require("@supabase/supabase-js");
const names=["STAGING_SUPABASE_URL","STAGING_SUPABASE_ANON_KEY",
 "STAGING_COUNCIL_A_EMAIL","STAGING_COUNCIL_A_PASSWORD",
 "STAGING_COUNCIL_B_EMAIL","STAGING_COUNCIL_B_PASSWORD"];
const missing=names.filter(x=>!process.env[x]);
if(missing.length)throw Error("Missing staging credentials: "+missing.join(", "));
const url=process.env.STAGING_SUPABASE_URL;
if(!/^https:\/\//.test(url)||/localhost|127\.0\.0\.1/.test(url))
 throw Error("Staging Supabase URL must be an HTTPS host");
async function actor(prefix){
 const db=createClient(url,process.env.STAGING_SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await db.auth.signInWithPassword({
  email:process.env[prefix+"_EMAIL"],password:process.env[prefix+"_PASSWORD"]});
 assert.ifError(error);assert.ok(data.user);
 const {data:profile,error:profileError}=await db.from("profiles")
  .select("active_organization_id").eq("id",data.user.id).single();
 assert.ifError(profileError);assert.ok(profile.active_organization_id);
 return {db,org:profile.active_organization_id};
}
test("two authenticated councils cannot read each other's financial data",async()=>{
 const a=await actor("STAGING_COUNCIL_A");
 const b=await actor("STAGING_COUNCIL_B");
 assert.notEqual(a.org,b.org,"Accounts must belong to different active organizations");
 for(const [who,other] of [[a,b],[b,a]]){
  for(const table of ["financial_years","gl_codes","budgets","actuals",
   "bank_transactions","cheques","fundraisers","fundraiser_entries",
   "budget_snapshots","database_backups","import_runs","audit_log"]){
   const {data,error}=await who.db.from(table).select("organization_id")
    .eq("organization_id",other.org).limit(1);
   assert.ifError(error);
   assert.deepEqual(data,[],table+" leaked cross-tenant rows");
  }
 }
});
