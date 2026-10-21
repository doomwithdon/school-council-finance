import {createHash} from "crypto";
import {NextResponse} from "next/server";
import {serverDb} from "../../../lib/supabase-server";
import {admin} from "../../../lib/supabase-admin";

const arr=(v:any)=>Array.isArray(v)?v:[];
const money=(v:any)=>Number.isFinite(Number(v))?Math.round(Number(v)*100)/100:0;
const hash=(v:any)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const key=(type:string,v:any)=>hash([type,...v]);
const iso=(v:any)=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||""));
const text=(v:any,n=500)=>v==null?null:String(v).trim().slice(0,n)||null;

export async function POST(req:Request){
 try{
  const d=await req.json();
  const session=serverDb();
  const {data:{user}}=await session.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {data:profile}=await session.from("profiles").select("role").eq("id",user.id).single();
  if(!["admin","treasurer"].includes(profile?.role))return NextResponse.json({error:"Read-only account"},{status:403});
  const db=admin();
  const {data:fy}=await db.from("financial_years").select("*").eq("label",d.financialYear).single();
  if(!fy)return NextResponse.json({error:"Financial year not found"},{status:400});
  const mode=d.mode==="merge"?"merge":"replace";
  if(fy.status==="closed"&&(mode!=="replace"||d.overwriteConfirmation!=="OVERWRITE "+fy.label))
   return NextResponse.json({error:"Closed years require Replace mode and exact confirmation: OVERWRITE "+fy.label},{status:400});
  if(d.detectedFinancialYear&&d.detectedFinancialYear!==fy.label&&d.yearMismatchConfirmation!=="IMPORT "+fy.label)
   return NextResponse.json({error:"Workbook year differs from destination. Type IMPORT "+fy.label+" to confirm."},{status:400});

  const glCodes=arr(d.glCodes).map((x:any)=>({code:text(x.code,40),description:text(x.description,300)})).filter((x:any)=>x.code&&x.description);
  const valid=new Set(glCodes.map((x:any)=>x.code));
  if(!glCodes.length)return NextResponse.json({error:"No valid GL codes found"},{status:400});

  const budgets=arr(d.budgets).map((x:any)=>({gl_code:text(x.gl_code,40),amount:money(x.amount),comments:text(x.comments),prior_budget:x.prior_budget==null?null:money(x.prior_budget),prior_actual:x.prior_actual==null?null:money(x.prior_actual)}));
  const actuals=arr(d.actuals).map((x:any)=>({date:String(x.date||""),gl_code:text(x.gl_code,40),amount:money(x.amount),description:text(x.description),school_month:x.school_month==null?null:Number(x.school_month),source_key:key("actual",[x.date,x.gl_code,money(x.amount),text(x.description),x.school_month])}));
  const bank=arr(d.bankTransactions).map((x:any)=>({date:String(x.date||""),transaction:text(x.transaction,500),withdrawal:money(x.withdrawal),deposit:money(x.deposit),balance:x.balance==null?null:money(x.balance),gl_code:text(x.gl_code,40),description:text(x.description),amount:money(x.amount),source_key:key("bank",[x.date,text(x.transaction),money(x.withdrawal),money(x.deposit),x.balance==null?null:money(x.balance),x.gl_code,text(x.description)])}));
  const cheques=arr(d.cheques).map((x:any)=>({cheque_no:text(x.cheque_no,80),gl_code:text(x.gl_code,40),amount:money(x.amount),cheque_date:String(x.cheque_date||""),cleared_date:x.cleared_date?String(x.cleared_date):null,vendor:text(x.vendor,300),description:text(x.description),invoice_no:text(x.invoice_no,100),source_key:key("cheque",[x.cheque_no,x.cheque_date,money(x.amount),x.gl_code,text(x.vendor),text(x.invoice_no)])}));

  const errors:string[]=[];
  for(const x of budgets)if(!x.gl_code||!valid.has(x.gl_code))errors.push("Budget contains unknown GL "+(x.gl_code||"(blank)"));
  for(const x of actuals){if(!iso(x.date))errors.push("Actual contains invalid date");if(!x.gl_code||!valid.has(x.gl_code))errors.push("Actual contains unknown GL "+(x.gl_code||"(blank)"))}
  for(const x of bank){if(!iso(x.date)||!x.transaction)errors.push("Bank transaction is missing date/transaction");if(x.gl_code&&!valid.has(x.gl_code))errors.push("Bank transaction contains unknown GL "+x.gl_code)}
  for(const x of cheques){if(!iso(x.cheque_date)||!x.cheque_no)errors.push("Cheque is missing cheque number/date");if(x.cleared_date&&!iso(x.cleared_date))errors.push("Cheque contains invalid cleared date");if(x.gl_code&&!valid.has(x.gl_code))errors.push("Cheque contains unknown GL "+x.gl_code)}
  if(errors.length)return NextResponse.json({error:[...new Set(errors)].slice(0,20).join("; ")},{status:400});

  const outside=(v:string)=>v<fy.start_date||v>fy.end_date;
  const warnings=[...new Set(arr(d.warnings).map(String))];
  const outActual=actuals.filter((x:any)=>outside(x.date)).length,outBank=bank.filter((x:any)=>outside(x.date)).length,outCheque=cheques.filter((x:any)=>outside(x.cheque_date)).length;
  if(outActual)warnings.push(outActual+" actual entries are outside "+fy.start_date+" to "+fy.end_date);
  if(outBank)warnings.push(outBank+" bank transactions are outside "+fy.start_date+" to "+fy.end_date);
  if(outCheque)warnings.push(outCheque+" cheques are outside "+fy.start_date+" to "+fy.end_date);

  const counts={glCodes:glCodes.length,budgets:budgets.length,actuals:actuals.length,bankTransactions:bank.length,cheques:cheques.length};
  const totals={
   budget:money(budgets.reduce((n:number,x:any)=>n+x.amount,0)),
   actual:money(actuals.reduce((n:number,x:any)=>n+x.amount,0)),
   deposits:money(bank.reduce((n:number,x:any)=>n+x.deposit,0)),
   withdrawals:money(bank.reduce((n:number,x:any)=>n+x.withdrawal,0)),
   cheques:money(cheques.reduce((n:number,x:any)=>n+x.amount,0))
  };
  const fingerprint=hash({financialYear:d.detectedFinancialYear,glCodes,budgets,actuals,bank,cheques});
  const {data:runId,error}=await db.rpc("atomic_excel_import",{
   p_financial_year:fy.id,p_user:user.id,p_file_name:text(d.fileName,255),p_fingerprint:fingerprint,p_mode:mode,
   p_gl_codes:glCodes,p_budgets:budgets,p_actuals:actuals,p_bank:bank,p_cheques:cheques,
   p_counts:counts,p_totals:totals,p_warnings:warnings
  });
  if(error)throw error;
  return NextResponse.json({ok:true,runId,financialYear:fy.label,mode,counts,totals,warnings});
 }catch(e:any){return NextResponse.json({error:e.message||"Import failed"},{status:500})}
}
