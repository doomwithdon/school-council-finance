import {serverDb} from "./supabase-server";
import {getOrganizationContext,multiOrgEnabled} from "./organization";

async function activeOrganizationId(){
 if(!multiOrgEnabled())return null;
 const db=serverDb();
 const {data:{user},error}=await db.auth.getUser();
 if(error)throw error;
 if(!user)throw new Error("Not authenticated");
 const context=await getOrganizationContext(user.id);
 if(!context)throw new Error("Organization required");
 return context.active.id;
}

export async function getYear(label?:string){
 const db=serverDb();
 const organizationId=await activeOrganizationId();
 let query=db.from("financial_years").select("*");
 if(organizationId)query=query.eq("organization_id",organizationId);
 if(label)query=query.eq("label",label);
 else query=query.eq("status","open").order("start_date",{ascending:false});
 const {data,error}=await query.limit(1).maybeSingle();
 if(error)throw error;
 if(data)return data;
 let fallback=db.from("financial_years").select("*").order("start_date",{ascending:false});
 if(organizationId)fallback=fallback.eq("organization_id",organizationId);
 const result=await fallback.limit(1).maybeSingle();
 if(result.error)throw result.error;
 return result.data;
}

export async function years(){
 const db=serverDb();
 const organizationId=await activeOrganizationId();
 let query=db.from("financial_years").select("*").order("start_date",{ascending:false});
 if(organizationId)query=query.eq("organization_id",organizationId);
 const {data,error}=await query;
 if(error)throw error;
 return data||[];
}
