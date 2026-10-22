import {serverDb} from "./supabase-server";

/**
 * Multi-organization UI is deliberately disabled until the coordinated tenant
 * isolation cutover has passed its security checks.
 */
export const multiOrgEnabled=()=>process.env.MULTI_ORG_CUTOVER_ENABLED==="true";

export type OrganizationChoice={
 id:string;
 name:string;
 role:"admin"|"treasurer"|"council";
};

export async function getOrganizationContext(userId:string){
 if(!multiOrgEnabled())return null;
 const db=serverDb();
 const {data:profile,error:profileError}=await db.from("profiles")
  .select("active_organization_id").eq("id",userId).single();
 if(profileError)throw profileError;
 const {data:memberships,error:membershipError}=await db.from("organization_memberships")
  .select("organization_id,role,organizations(id,name,status)").eq("user_id",userId);
 if(membershipError)throw membershipError;
 const organizations:OrganizationChoice[]=(memberships||[]).flatMap((m:any)=>{
  const org=Array.isArray(m.organizations)?m.organizations[0]:m.organizations;
  return org?.status==="active"?[{id:org.id,name:org.name,role:m.role}]:[];
 });
 const active=organizations.find(o=>o.id===profile?.active_organization_id);
 if(!active)throw new Error("No authorized active organization selected");
 return {active,organizations};
}
