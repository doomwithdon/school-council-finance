"use server";

import { revalidatePath } from "next/cache";
import { requireWriter } from "../../lib/auth";
import { admin } from "../../lib/supabase-admin";
import { multiOrgEnabled } from "../../lib/organization";

const roles=["admin","treasurer","council"] as const;
type Role=(typeof roles)[number];

function role(v:FormDataEntryValue|null):Role{
 const r=String(v||"council") as Role;
 if(!roles.includes(r))throw new Error("Invalid role");
 return r;
}

export async function addUser(form:FormData){
 if(multiOrgEnabled())throw new Error("This legacy administration action is disabled until tenant-scoped authorization is implemented");
 const {user,profile,db}=await requireWriter();
 const email=String(form.get("email")||"").trim().toLowerCase();
 const fullName=String(form.get("full_name")||"").trim();
 const newRole=role(form.get("role"));
 const password=String(form.get("password")||"");
 if(!email)throw new Error("Email is required");
 if(password.length<8)throw new Error("Temporary password must be at least 8 characters");
 const a=admin();
 const {data,error}=await a.auth.admin.createUser({
  email,password,email_confirm:true,
  user_metadata:{full_name:fullName}
 });
 if(error)throw error;
 if(!data.user)throw new Error("User could not be created");
 const {error:pe}=await a.from("profiles").upsert({
  id:data.user.id,email,full_name:fullName||null,role:newRole
 });
 if(pe){
  await a.auth.admin.deleteUser(data.user.id);
  throw pe;
 }
 await db.from("audit_log").insert({user_id:user.id,action:"create",entity:"user",entity_id:data.user.id,after_data:{email,full_name:fullName,role:newRole,created_by_role:profile.role}});
 revalidatePath("/users");
}

export async function updateUser(form:FormData){
 if(multiOrgEnabled())throw new Error("This legacy administration action is disabled until tenant-scoped authorization is implemented");
 const {user,db}=await requireWriter();
 const id=String(form.get("id")||"");
 const newRole=role(form.get("role"));
 const fullName=String(form.get("full_name")||"").trim();
 if(!id)throw new Error("User is required");
 if(id===user.id&&newRole==="council")throw new Error("You cannot remove your own finance access");
 const a=admin();
 const {data:before}=await a.from("profiles").select("email,full_name,role").eq("id",id).single();
 if(!before)throw new Error("User profile not found");
 const {error}=await a.from("profiles").update({full_name:fullName||null,role:newRole}).eq("id",id);
 if(error)throw error;
 await db.from("audit_log").insert({user_id:user.id,action:"update",entity:"user",entity_id:id,before_data:before,after_data:{...before,full_name:fullName||null,role:newRole}});
 revalidatePath("/users");
}

export async function resetPassword(form:FormData){
 if(multiOrgEnabled())throw new Error("This legacy administration action is disabled until tenant-scoped authorization is implemented");
 const {user,db}=await requireWriter();
 const id=String(form.get("id")||"");
 const password=String(form.get("password")||"");
 if(password.length<8)throw new Error("Temporary password must be at least 8 characters");
 const a=admin();
 const {error}=await a.auth.admin.updateUserById(id,{password});
 if(error)throw error;
 await db.from("audit_log").insert({user_id:user.id,action:"password_reset",entity:"user",entity_id:id});
 revalidatePath("/users");
}

export async function deleteUser(form:FormData){
 if(multiOrgEnabled())throw new Error("This legacy administration action is disabled until tenant-scoped authorization is implemented");
 const {user,db}=await requireWriter();
 const id=String(form.get("id")||"");
 if(!id)throw new Error("User is required");
 if(id===user.id)throw new Error("You cannot delete your own account");
 const a=admin();
 const {data:before}=await a.from("profiles").select("email,full_name,role").eq("id",id).single();
 if(!before)throw new Error("User profile not found");
 const {error}=await a.auth.admin.deleteUser(id);
 if(error)throw error;
 await db.from("audit_log").insert({user_id:user.id,action:"delete",entity:"user",entity_id:id,before_data:before});
 revalidatePath("/users");
}
