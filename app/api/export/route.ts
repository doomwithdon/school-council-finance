import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { serverDb } from "../../../lib/supabase-server";

const n=(v:any)=>Number(v||0);
const safe=(v:any)=>v==null?"":v;

export async function GET(req:Request){
 try{
  const db=serverDb();
  const {data:{user}}=await db.auth.getUser();
  if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});

  const url=new URL(req.url);
  const label=url.searchParams.get("year");
  let q=db.from("financial_years").select("*");
  if(label)q=q.eq("label",label);
  else q=q.eq("status","open").order("start_date",{ascending:false}).limit(1);
  const {data:fy,error:fyError}=await q.limit(1).maybeSingle();
  if(fyError)throw fyError;
  if(!fy)return NextResponse.json({error:"Financial year not found"},{status:404});

  const [
   {data:budgets,error:bErr},
   {data:actuals,error:aErr},
   {data:bank,error:tErr},
   {data:cheques,error:cErr},
   {data:fundraisers,error:fErr},
   {data:entries,error:eErr},
   {data:gl,error:gErr}
  ]=await Promise.all([
   db.from("budgets").select("*").eq("financial_year_id",fy.id).order("gl_code"),
   db.from("actuals").select("*").eq("financial_year_id",fy.id).order("date"),
   db.from("bank_transactions").select("*").eq("financial_year_id",fy.id).order("date"),
   db.from("cheques").select("*").eq("financial_year_id",fy.id).order("cheque_date"),
   db.from("fundraisers").select("*").eq("financial_year_id",fy.id).order("event_date"),
   db.from("fundraiser_entries").select("*"),
   db.from("gl_codes").select("*").order("code")
  ]);
  const firstError=bErr||aErr||tErr||cErr||fErr||eErr||gErr;if(firstError)throw firstError;

  const glMap=new Map((gl||[]).map((x:any)=>[x.code,x.description]));
  const actualByGl=new Map<string,number>();
  for(const x of actuals||[])actualByGl.set(x.gl_code,(actualByGl.get(x.gl_code)||0)+n(x.amount));

  const budgetRows=(budgets||[]).map((x:any)=>({
   "GL Code":x.gl_code,
   "GL Description":glMap.get(x.gl_code)||"",
   "Budget":n(x.amount),
   "Actual":actualByGl.get(x.gl_code)||0,
   "Remaining":n(x.amount)-(actualByGl.get(x.gl_code)||0),
   "Comments":safe(x.comments),
   "Prior Budget":x.prior_budget==null?"":n(x.prior_budget),
   "Prior Actual":x.prior_actual==null?"":n(x.prior_actual)
  }));
  const actualRows=(actuals||[]).map((x:any)=>({
   "Date":x.date,"GL Code":x.gl_code,"GL Description":glMap.get(x.gl_code)||"",
   "Amount":n(x.amount),"Description":safe(x.description),"School Month":safe(x.school_month)
  }));
  const bankRows=(bank||[]).map((x:any)=>({
   "Date":x.date,"Transaction":x.transaction,"GL Code":safe(x.gl_code),
   "GL Description":x.gl_code?glMap.get(x.gl_code)||"":"",
   "Withdrawal":n(x.withdrawal),"Deposit":n(x.deposit),
   "Balance":x.balance==null?"":n(x.balance),"Description":safe(x.description),
   "Reconciled":x.reconciled?"Yes":"No"
  }));
  const chequeRows=(cheques||[]).map((x:any)=>({
   "Cheque #":x.cheque_no,"Cheque Date":x.cheque_date,"Cleared Date":safe(x.cleared_date),
   "Status":x.voided?"Void":x.cleared_date?"Cleared":"Outstanding",
   "Vendor":safe(x.vendor),"GL Code":safe(x.gl_code),
   "GL Description":x.gl_code?glMap.get(x.gl_code)||"":"",
   "Amount":n(x.amount),"Description":safe(x.description),"Invoice #":safe(x.invoice_no)
  }));
  const fundraiserIds=new Set((fundraisers||[]).map((x:any)=>x.id));
  const fundraiserRows=(entries||[]).filter((x:any)=>fundraiserIds.has(x.fundraiser_id)).map((x:any)=>{
   const f=(fundraisers||[]).find((z:any)=>z.id===x.fundraiser_id);
   return {"Fundraiser":f?.name||"","Event Date":safe(f?.event_date),"Entry Date":x.transaction_date,
    "Type":x.entry_type,"Amount":n(x.amount),"Description":safe(x.description)};
  });

  const totalBudget=(budgets||[]).reduce((s:number,x:any)=>s+n(x.amount),0);
  const totalActual=(actuals||[]).reduce((s:number,x:any)=>s+n(x.amount),0);
  const deposits=(bank||[]).reduce((s:number,x:any)=>s+n(x.deposit),0);
  const withdrawals=(bank||[]).reduce((s:number,x:any)=>s+n(x.withdrawal),0);
  const outstanding=(cheques||[]).filter((x:any)=>!x.cleared_date&&!x.voided).reduce((s:number,x:any)=>s+n(x.amount),0);
  const latestBalance=(bank||[]).length?(bank||[])[(bank||[]).length-1].balance:null;

  const wb=XLSX.utils.book_new();
  const summary=XLSX.utils.aoa_to_sheet([
   ["St. Elizabeth Seton School Council","Financial Year Export"],
   ["Financial Year",fy.label],
   ["Period",fy.start_date+" to "+fy.end_date],
   ["Status",fy.status],
   ["Exported At",new Date().toISOString()],
   [],
   ["Financial Summary","Amount"],
   ["Opening Carry-Forward",n(fy.opening_carry_forward)],
   ["Total Budget",totalBudget],
   ["Total Actuals",totalActual],
   ["Budget Remaining",totalBudget-totalActual],
   ["Bank Deposits",deposits],
   ["Bank Withdrawals",withdrawals],
   ["Latest Bank Balance",latestBalance==null?"":n(latestBalance)],
   ["Outstanding Cheques",outstanding],
   [],
   ["Record Counts","Count"],
   ["Budget GLs",(budgets||[]).length],
   ["Actual Entries",(actuals||[]).length],
   ["Bank Transactions",(bank||[]).length],
   ["Cheques",(cheques||[]).length],
   ["Fundraisers",(fundraisers||[]).length]
  ]);
  summary["!cols"]=[{wch:28},{wch:24}];
  XLSX.utils.book_append_sheet(wb,summary,"Summary");

  const add=(name:string,rows:any[],widths:number[])=>{
   const ws=XLSX.utils.json_to_sheet(rows);
   ws["!cols"]=widths.map(wch=>({wch}));
   XLSX.utils.book_append_sheet(wb,ws,name);
  };
  add("Budget",budgetRows,[14,32,14,14,14,32,14,14]);
  add("Actuals",actualRows,[13,14,32,14,42,14]);
  add("Bank Transactions",bankRows,[13,32,14,30,14,14,14,36,12]);
  add("Cheques",chequeRows,[13,13,13,14,28,14,30,14,36,16]);
  add("Fundraisers",fundraiserRows,[28,13,13,14,14,42]);

  const buf=XLSX.write(wb,{type:"buffer",bookType:"xlsx"});
  const filename="Seton-Council-Finance-"+fy.label+".xlsx";
  return new NextResponse(buf,{
   status:200,
   headers:{
    "Content-Type":"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition":'attachment; filename="'+filename+'"',
    "Cache-Control":"no-store"
   }
  });
 }catch(e:any){
  return NextResponse.json({error:e.message||"Export failed"},{status:500});
 }
}
