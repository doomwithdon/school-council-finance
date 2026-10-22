import {redirect} from "next/navigation";
import {serverDb} from "./supabase-server";
import {getOrganizationContext,multiOrgEnabled} from "./organization";

export async function currentUser(){
 const db=serverDb();
 const {data:{user},error:authError}=await db.auth.getUser();
 if(authError)throw authError;
 if(!user)redirect("/login");
 const {data:profile,error:profileError}=await db.from("profiles").select("*").eq("id",user.id).single();
 if(profileError)throw profileError;
 if(multiOrgEnabled()){
  // Do not trust profiles.role: it is a legacy global role.
  const context=await getOrganizationContext(user.id);
  if(!context)throw new Error("Organization context is required");
  return {user,profile:{...profile,role:context.active.role},db,organization:context.active};
 }
 return {user,profile,db,organization:null};
}

export async function requireWriter(){
 const x=await currentUser();
 if(!["admin","treasurer"].includes(x.profile?.role))throw new Error("Read-only account");
 return x;
}
export async function requireAdmin(){
 const x=await currentUser();
 if(x.profile?.role!=="admin")throw new Error("Admin required");
 return x;
}
