"use server";
import {redirect} from "next/navigation";
import {requireAdmin} from "../../lib/auth";
import {multiOrgEnabled} from "../../lib/organization";

const shiftYear=(date:string,years=1)=>{
 const [y,m,d]=date.split("-").map(Number);
 return [y+years,String(m).padStart(2,"0"),String(d).padStart(2,"0")].join("-");
};

export async function closeYear(f:FormData){
 const {db}=await requireAdmin();
 if(multiOrgEnabled())throw new Error("Year closing is unavailable until the tenant-safe database function is deployed");
 if(f.get("confirm")!=="CLOSE")throw new Error("Type CLOSE to confirm");
 const id=String(f.get("id"));
 const {data:year,error:yearError}=await db.from("financial_years").select("*").eq("id",id).single();
 if(yearError||!year)throw new Error("Financial year not found");
 if(year.status!=="open")throw new Error(year.label+" is already closed");

 const match=String(year.label).match(/^(\d{4})-(\d{4})$/);
 if(!match||Number(match[2])!==Number(match[1])+1)throw new Error("Financial year label must use YYYY-YYYY format");
 const nextLabel=match[2]+"-"+(Number(match[2])+1);
 const nextStart=shiftYear(year.start_date);
 const nextEnd=shiftYear(year.end_date);

 const {error}=await db.rpc("close_financial_year",{p_year:id,p_next_label:nextLabel,p_next_start:nextStart,p_next_end:nextEnd});
 if(error)throw new Error(error.message);
 redirect("/?year="+encodeURIComponent(nextLabel));
}
