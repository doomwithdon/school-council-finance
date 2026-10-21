"use server";

import { redirect } from "next/navigation";
import { serverDb } from "../../lib/supabase-server";

export async function changePassword(form:FormData){
 const db=serverDb();
 const {data:{user}}=await db.auth.getUser();
 if(!user)redirect("/login");
 const current=String(form.get("current_password")||"");
 const next=String(form.get("new_password")||"");
 const confirm=String(form.get("confirm_password")||"");
 if(next.length<8)redirect("/account?error="+encodeURIComponent("New password must be at least 8 characters"));
 if(next!==confirm)redirect("/account?error="+encodeURIComponent("New passwords do not match"));
 if(!user.email)redirect("/account?error="+encodeURIComponent("Account email is unavailable"));
 const {error:verify}=await db.auth.signInWithPassword({email:user.email,password:current});
 if(verify)redirect("/account?error="+encodeURIComponent("Current password is incorrect"));
 const {error}=await db.auth.updateUser({password:next});
 if(error)redirect("/account?error="+encodeURIComponent(error.message));
 await db.from("audit_log").insert({user_id:user.id,action:"password_change",entity:"user",entity_id:user.id});
 redirect("/account?success="+encodeURIComponent("Password changed successfully"));
}
