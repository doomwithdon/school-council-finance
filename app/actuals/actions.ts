"use server";
import {revalidatePath} from "next/cache";import {requireOpenYear,num,val} from "../../lib/finance-write";
export async function addActual(f:FormData){
 const yearId=String(f.get("financial_year_id"));const {db,user,year}=await requireOpenYear(yearId);const date=String(f.get("date")),gl=String(f.get("gl_code")||"");
 if(date<year.start_date||date>year.end_date)throw new Error("Date must be within "+year.start_date+" to "+year.end_date);
 const row={financial_year_id:yearId,date,gl_code:gl,amount:num(f.get("amount")),description:val(f.get("description")),school_month:f.get("school_month")?Number(f.get("school_month")):null};
 const {data,error}=await db.from("actuals").insert(row).select().single();if(error)throw error;await db.from("audit_log").insert({user_id:user.id,action:"create",entity:"actual",entity_id:String(data.id),after_data:data});revalidatePath("/");revalidatePath("/actuals");revalidatePath("/budget");
}
export async function deleteActual(f:FormData){
 const yearId=String(f.get("financial_year_id")),id=String(f.get("id"));const {db,user}=await requireOpenYear(yearId);const {data:before}=await db.from("actuals").select("*").eq("id",id).eq("financial_year_id",yearId).single();const {error}=await db.from("actuals").delete().eq("id",id).eq("financial_year_id",yearId);if(error)throw error;await db.from("audit_log").insert({user_id:user.id,action:"delete",entity:"actual",entity_id:id,before_data:before});revalidatePath("/");revalidatePath("/actuals");revalidatePath("/budget");
}
