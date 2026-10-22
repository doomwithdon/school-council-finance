"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {serverDb} from "../../lib/supabase-server";
import {multiOrgEnabled} from "../../lib/organization";

export async function switchOrganization(form:FormData){
 if(!multiOrgEnabled())throw new Error("Organization switching is not enabled");
 const db=serverDb();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/login");
 const id=String(form.get("organization_id")||"");
 if(!/^[0-9a-f-]{36}$/i.test(id))throw new Error("Invalid organization");
 const {error}=await db.rpc("switch_organization",{p_organization_id:id});
 if(error)throw new Error("Unable to switch organization: "+error.message);
 revalidatePath("/", "layout");
 redirect("/");
}
