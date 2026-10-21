import {requireWriter} from "./auth";
export async function requireOpenYear(yearId:string){
 const x=await requireWriter();
 const {data:year,error}=await x.db.from("financial_years").select("*").eq("id",yearId).single();
 if(error||!year)throw new Error("Financial year not found");
 if(year.status!=="open")throw new Error(year.label+" is closed and cannot be edited");
 return {...x,year};
}
export const num=(v:FormDataEntryValue|null)=>{const n=Number(v||0);if(!Number.isFinite(n))throw new Error("Invalid amount");return Math.round(n*100)/100};
export const val=(v:FormDataEntryValue|null)=>{const s=String(v||"").trim();return s||null};
