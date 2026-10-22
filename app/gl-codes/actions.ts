"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "../../lib/auth";
import { multiOrgEnabled } from "../../lib/organization";

const clean=(v:FormDataEntryValue|null,n:number)=>String(v||"").trim().slice(0,n);

export async function addGlCode(form:FormData){
 const {db,user,organization}=await requireWriter();
 const org=multiOrgEnabled()?organization?.id:null;
 const code=clean(form.get("code"),40);
 const description=clean(form.get("description"),300);
 if(!code||!description)throw new Error("GL code and description are required");
 const {data:existing}=await (org?db.from("gl_codes").select("code").eq("code",code).eq("organization_id",org):db.from("gl_codes").select("code").eq("code",code)).maybeSingle();
 if(existing)throw new Error("GL code already exists");
 const {error}=await db.from("gl_codes").insert(org?{code,description,organization_id:org}:{code,description});
 if(error)throw error;
 await db.from("audit_log").insert({...(org?{organization_id:org}:{}),user_id:user.id,action:"create",entity:"gl_code",entity_id:code,after_data:{code,description}});
 revalidatePath("/gl-codes");revalidatePath("/budget");revalidatePath("/actuals");revalidatePath("/transactions");revalidatePath("/cheques");
}

export async function updateGlCode(form:FormData){
 const {db,user,organization}=await requireWriter();
 const org=multiOrgEnabled()?organization?.id:null;
 const code=clean(form.get("code"),40);
 const description=clean(form.get("description"),300);
 if(!code||!description)throw new Error("GL code and description are required");
 const {data:before,error:be}=await (org?db.from("gl_codes").select("*").eq("code",code).eq("organization_id",org):db.from("gl_codes").select("*").eq("code",code)).single();
 if(be)throw be;
 const {error}=await (org?db.from("gl_codes").update({description}).eq("code",code).eq("organization_id",org):db.from("gl_codes").update({description}).eq("code",code));
 if(error)throw error;
 await db.from("audit_log").insert({...(org?{organization_id:org}:{}),user_id:user.id,action:"update",entity:"gl_code",entity_id:code,before_data:before,after_data:{...before,description}});
 revalidatePath("/gl-codes");revalidatePath("/budget");revalidatePath("/actuals");revalidatePath("/transactions");revalidatePath("/cheques");
}

export async function deleteGlCode(form:FormData){
 const {db,user,organization}=await requireWriter();
 const org=multiOrgEnabled()?organization?.id:null;
 const code=clean(form.get("code"),40);
 if(!code)throw new Error("GL code is required");
 const checks=["budgets","actuals","bank_transactions","cheques","fundraiser_entries"] as const;
 for(const table of checks){
  const {count,error}=await (org?db.from(table).select("*",{count:"exact",head:true}).eq("gl_code",code).eq("organization_id",org):db.from(table).select("*",{count:"exact",head:true}).eq("gl_code",code));
  if(error)throw error;
  if((count||0)>0)throw new Error("Cannot delete GL "+code+" because it is already used in financial records. Rename its description instead.");
 }
 const {data:before}=await (org?db.from("gl_codes").select("*").eq("code",code).eq("organization_id",org):db.from("gl_codes").select("*").eq("code",code)).single();
 const {error}=await (org?db.from("gl_codes").delete().eq("code",code).eq("organization_id",org):db.from("gl_codes").delete().eq("code",code));
 if(error)throw error;
 await db.from("audit_log").insert({...(org?{organization_id:org}:{}),user_id:user.id,action:"delete",entity:"gl_code",entity_id:code,before_data:before});
 revalidatePath("/gl-codes");revalidatePath("/budget");revalidatePath("/actuals");revalidatePath("/transactions");revalidatePath("/cheques");
}
