import * as XLSX from "xlsx";
export type ImportData={detectedFinancialYear:string|null;glCodes:any[];budgets:any[];actuals:any[];bankTransactions:any[];cheques:any[];warnings:string[];errors:string[]};

const norm=(v:any)=>String(v??"").trim().toLowerCase().replace(/[^a-z0-9]+/g," ");
const date=(v:any)=>{if(!v)return null;if(v instanceof Date)return v.toISOString().slice(0,10);if(typeof v==="number"){const d=XLSX.SSF.parse_date_code(v);return d?new Date(Date.UTC(d.y,d.m-1,d.d)).toISOString().slice(0,10):null}const d=new Date(v);return isNaN(+d)?null:d.toISOString().slice(0,10)};
const yearPart=(v:any)=>{const n=Number(v);if(Number.isInteger(n)&&n>=2000&&n<=2100)return n;const m=String(v??"").match(/20\d{2}/);return m?Number(m[0]):null};
function detectYear(wb:XLSX.WorkBook){const ref=wb.Sheets["Ref"];if(!ref)return null;const b=yearPart(ref["B2"]?.v),c=yearPart(ref["C2"]?.v);if(b&&c&&c===b+1)return b+"-"+c;if(b)return b+"-"+(b+1);return null}

function table(wb:XLSX.WorkBook,name:string,required:string[]){
 const s=wb.Sheets[name];if(!s)return {rows:[] as any[],headers:[] as string[],headerRow:-1};
 const grid=XLSX.utils.sheet_to_json<any[]>(s,{header:1,defval:null,raw:true});
 let headerRow=-1;
 for(let i=0;i<Math.min(grid.length,25);i++){const hs=(grid[i]||[]).map(norm);if(required.every(x=>hs.includes(norm(x)))){headerRow=i;break}}
 if(headerRow<0)return {rows:[] as any[],headers:[] as string[],headerRow};
 const headers=(grid[headerRow]||[]).map((x:any)=>String(x??"").trim());
 const data=grid.slice(headerRow+1).map((row:any[])=>{const o:any={};headers.forEach((h,i)=>{if(h)o[h]=row?.[i]??null});return o});
 return {rows:data,headers,headerRow};
}
const get=(r:any,...names:string[])=>{for(const wanted of names){const k=Object.keys(r).find(x=>norm(x)===norm(wanted));if(k&&r[k]!=null)return r[k]}return null};
function budgetValue(r:any,detected:string|null){
 if(detected){const [a,b]=detected.split("-").map(Number);for(const k of [String(a).slice(2)+"/"+String(b).slice(2)+" Budget",detected+" Budget",a+"/"+b+" Budget"]){const v=get(r,k);if(v!=null)return v}}
 const amount=get(r,"Amount");if(amount!=null)return amount;
 const k=Object.keys(r).find(x=>/budget/i.test(x)&&!/py|prior|comment/i.test(x));return k?r[k]:null;
}

export function parseCouncilWorkbook(buffer:ArrayBuffer):ImportData{
 const wb=XLSX.read(buffer,{type:"array",cellDates:true});
 const detectedFinancialYear=detectYear(wb),warnings:string[]=[],errors:string[]=[];
 const requiredSheets=["GL Codes","Budget Detail","Actual Detail","Bank Transactions","Cheque Register"];
 for(const x of requiredSheets)if(!wb.SheetNames.includes(x))errors.push("Missing required sheet: "+x);
 if(!detectedFinancialYear)warnings.push("Financial year could not be detected from Ref!B2/C2; select the destination year manually.");

 const gl=table(wb,"GL Codes",["GL Code","Description"]);
 if(gl.headerRow<0)errors.push("Could not locate GL Codes headers.");
 const glCodes=gl.rows.filter(r=>get(r,"GL Code")&&get(r,"Description")).map(r=>({code:String(get(r,"GL Code")).trim(),description:String(get(r,"Description")).trim()}));
 const valid=new Set(glCodes.map(x=>x.code));

 const bd=table(wb,"Budget Detail",["GL Code"]);
 if(bd.headerRow<0)errors.push("Could not locate Budget Detail headers.");
 const grouped=new Map<string,any>();let excludedBudget=0,seenBudgetRows=0;
 for(const r of bd.rows){
  const code=String(get(r,"GL Code")??"").trim(),raw=budgetValue(r,detectedFinancialYear);
  if(raw==null||raw==="")continue;seenBudgetRows++;
  if(!valid.has(code)){excludedBudget++;continue}
  const amount=Number(raw);if(!Number.isFinite(amount)){warnings.push("Invalid budget amount for GL "+code);continue}
  const comment=get(r,"Budget Comments","Comment"),prev=grouped.get(code);
  if(prev){prev.amount+=amount;if(comment)prev.comments=[prev.comments,comment].filter(Boolean).join(" | ")}
  else grouped.set(code,{gl_code:code,amount,comments:comment??null,prior_budget:get(r,"PY Budget")==null?null:Number(get(r,"PY Budget"))||null,prior_actual:get(r,"PY Actual")==null?null:Number(get(r,"PY Actual"))||null});
 }
 const budgets=[...grouped.values()];
 if(excludedBudget)warnings.push("Excluded "+excludedBudget+" budget summary/invalid GL rows.");
 if(seenBudgetRows>0&&budgets.length===0)errors.push("Budget Detail contains populated budget rows but none could be parsed.");

 const ad=table(wb,"Actual Detail",["Date","GL Code","Amount"]);
 if(ad.headerRow<0)errors.push("Could not locate Actual Detail headers (Date, GL Code, Amount).");
 const actualCandidates=ad.rows.filter(r=>get(r,"Date")!=null||get(r,"GL Code")!=null||get(r,"Amount")!=null);
 const actuals=ad.rows.filter(r=>get(r,"Date")&&get(r,"GL Code")&&get(r,"Amount")!=null).map(r=>({date:date(get(r,"Date")),gl_code:String(get(r,"GL Code")).trim(),amount:Number(get(r,"Amount"))||0,description:get(r,"Comment","Description")??null,school_month:Number(get(r,"School Month"))||null})).filter(x=>x.date);
 if(actualCandidates.length>0&&actuals.length===0)errors.push("Actual Detail contains populated rows but zero actual transactions were parsed. Import blocked.");
 if(actuals.length)warnings.push("Parsed "+actuals.length+" Actual Detail transactions.");

 const bt=table(wb,"Bank Transactions",["Date","Transaction"]);
 if(bt.headerRow<0)errors.push("Could not locate Bank Transactions headers.");
 const bankTransactions=bt.rows.filter(r=>get(r,"Date")&&get(r,"Transaction")).map(r=>({date:date(get(r,"Date")),transaction:String(get(r,"Transaction")),withdrawal:Number(get(r,"Withdrawals ($)","Withdrawals"))||0,deposit:Number(get(r,"Deposits ($)","Deposits"))||0,balance:get(r,"Balance ($)","Balance")==null?null:Number(get(r,"Balance ($)","Balance"))||0,gl_code:get(r,"GL")?String(get(r,"GL")).trim():null,description:get(r,"Description")??null,amount:Number(get(r,"Amount"))||0})).filter(x=>x.date);

 const cq=table(wb,"Cheque Register",["Cheque No.","Cheque Date"]);
 if(cq.headerRow<0)errors.push("Could not locate Cheque Register headers.");
 const cheques=cq.rows.filter(r=>get(r,"Cheque No.","Cheque No")&&get(r,"Cheque Date")).map(r=>({cheque_no:String(get(r,"Cheque No.","Cheque No")),gl_code:get(r,"GL")?String(get(r,"GL")).trim():null,amount:Number(get(r,"Amount"))||0,cheque_date:date(get(r,"Cheque Date")),cleared_date:date(get(r,"Cleared Date")),vendor:get(r,"Vendor")??null,description:get(r,"Description")??null,invoice_no:get(r,"Invoice #")!=null?String(get(r,"Invoice #")):null})).filter(x=>x.cheque_date);

 [...budgets,...actuals,...bankTransactions,...cheques].forEach((r:any)=>{if(r.gl_code&&!valid.has(r.gl_code))warnings.push("Unknown GL code "+r.gl_code)});
 return {detectedFinancialYear,glCodes,budgets,actuals,bankTransactions,cheques,warnings:[...new Set(warnings)],errors:[...new Set(errors)]};
}
