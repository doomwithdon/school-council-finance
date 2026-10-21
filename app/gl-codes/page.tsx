import { requireWriter } from "../../lib/auth";
import { addGlCode, deleteGlCode, updateGlCode } from "./actions";

export default async function GlCodesPage(){
 const {db}=await requireWriter();
 const {data:codes,error}=await db.from("gl_codes").select("*").order("code");
 if(error)throw error;

 const usage=await Promise.all((codes||[]).map(async (g:any)=>{
  const tables=["budgets","actuals","bank_transactions","cheques","fundraiser_entries"] as const;
  let count=0;
  for(const t of tables){
   const {count:c}=await db.from(t).select("*",{count:"exact",head:true}).eq("gl_code",g.code);
   count+=c||0;
  }
  return [g.code,count] as const;
 }));
 const usageMap=new Map(usage);

 return <>
  <section className="pageHeader">
   <div><div className="eyebrow">ADMINISTRATION</div><h1>GL codes</h1><p>Manage the General Ledger codes used across budgets and financial entries.</p></div>
  </section>

  <section className="panel">
   <div className="panelHead"><div><div className="eyebrow">NEW GL CODE</div><h2>Add GL code</h2></div></div>
   <p className="muted">GL codes are shared across financial years. Admin and Treasurer accounts can manage them.</p>
   <form action={addGlCode} className="formgrid">
    <input name="code" placeholder="GL code" maxLength={40} required/>
    <input name="description" placeholder="Description" maxLength={300} required/>
    <button type="submit">Add GL code</button>
   </form>
  </section>

  <section className="panel">
   <div className="panelHead"><div><div className="eyebrow">CHART OF ACCOUNTS</div><h2>Current GL codes</h2></div><span className="muted">{codes?.length||0} codes</span></div>
   <table>
    <thead><tr><th>GL Code</th><th>Description</th><th>Usage</th><th>Update</th><th>Remove</th></tr></thead>
    <tbody>{codes?.map((g:any)=>{
     const used=usageMap.get(g.code)||0;
     return <tr key={g.code}>
      <td><strong>{g.code}</strong></td>
      <td>{g.description}</td>
      <td>{used} record{used===1?"":"s"}</td>
      <td><form action={updateGlCode} className="inlineForm"><input type="hidden" name="code" value={g.code}/><input name="description" defaultValue={g.description} required/><button type="submit">Save</button></form></td>
      <td>{used===0?<form action={deleteGlCode}><input type="hidden" name="code" value={g.code}/><button type="submit" className="linkbutton">Delete</button></form>:<span className="muted">In use</span>}</td>
     </tr>;
    })}</tbody>
   </table>
  </section>
 </>;
}
