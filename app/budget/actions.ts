"use server";
import {revalidatePath} from "next/cache";import {requireOpenYear,num,val} from "../../lib/finance-write";
export async function saveBudget(f:FormData){
 const yearId=String(f.get("financial_year_id")),gl=String(f.get("gl_code")||"").trim();if(!gl)throw new Error("GL code required");
 const {db,user,year}=await requireOpenYear(yearId);const amount=num(f.get("amount")),comments=val(f.get("comments"));
 const {data:before}=await db.from("budgets").select("*").eq("financial_year_id",yearId).eq("gl_code",gl).maybeSingle();
 const {data,error}=await db.from("budgets").upsert({financial_year_id:yearId,gl_code:gl,amount,comments},{onConflict:"financial_year_id,gl_code"}).select().single();if(error)throw error;
 await db.from("audit_log").insert({user_id:user.id,action:before?"update":"create",entity:"budget",entity_id:String(data.id),before_data:before,after_data:data});
 revalidatePath("/");revalidatePath("/budget?year="+year.label);
}
