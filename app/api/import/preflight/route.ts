import {NextResponse} from "next/server";
import {serverDb} from "../../../../lib/supabase-server";
import {getOrganizationContext,multiOrgEnabled} from "../../../../lib/organization";

// Read-only preflight for the future tenant-scoped importer.
// This endpoint NEVER calls the service-role client or writes finance data.
export async function POST(req:Request){
 try{
  if(!multiOrgEnabled())return NextResponse.json({error:"Tenant preflight is disabled"},{status:404});
  const db=serverDb();
  const {data:{user},error:authError}=await db.auth.getUser();
  if(authError||!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const context=await getOrganizationContext(user.id);
  if(!context||!["admin","treasurer"].includes(context.active.role))
   return NextResponse.json({error:"Read-only account"},{status:403});
  const body=await req.json();
  const label=typeof body?.financialYear==="string"?body.financialYear.trim():"";
  if(!/^\d{4}-\d{4}$/.test(label))
   return NextResponse.json({error:"Invalid financial year"},{status:400});
  const {data:year,error:yearError}=await db.from("financial_years")
   .select("id,label,status,start_date,end_date,organization_id")
   .eq("organization_id",context.active.id).eq("label",label).maybeSingle();
  if(yearError)throw yearError;
  if(!year)return NextResponse.json({error:"Financial year not found in active organization"},{status:404});
  const mode=body?.mode==="merge"?"merge":body?.mode==="replace"?"replace":null;
  if(!mode)return NextResponse.json({error:"Invalid import mode"},{status:400});
  if(year.status==="closed"&&(mode!=="replace"||body?.overwriteConfirmation!=="OVERWRITE "+year.label))
   return NextResponse.json({error:"Closed year requires Replace and exact OVERWRITE confirmation"},{status:400});
  if(body?.detectedFinancialYear&&body.detectedFinancialYear!==year.label&&body?.yearMismatchConfirmation!=="IMPORT "+year.label)
   return NextResponse.json({error:"Workbook year mismatch requires exact IMPORT confirmation"},{status:400});
  return NextResponse.json({
   ok:true,writeEnabled:false,organization:{id:context.active.id,name:context.active.name},
   financialYear:{id:year.id,label:year.label,status:year.status,startDate:year.start_date,endDate:year.end_date},
   mode,message:"Authorization and destination checks passed; import writes remain disabled."
  });
 }catch(e:any){
  return NextResponse.json({error:"Unable to validate import destination"},{status:500});
 }
}
