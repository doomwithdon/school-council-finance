import { requireWriter } from "../../lib/auth";
import { admin } from "../../lib/supabase-admin";
import { addUser, deleteUser, resetPassword, updateUser } from "./actions";

export default async function UsersPage(){
 await requireWriter();
 const a=admin();
 const {data:profiles,error}=await a.from("profiles").select("*").order("created_at",{ascending:true});
 if(error)throw error;

 return <>
  <section className="pageHeader">
   <div><div className="eyebrow">ADMINISTRATION</div><h1>Users & access</h1><p>Create accounts and manage access to Seton Council Finance.</p></div>
  </section>

  <section className="panel">
   <div className="panelHead"><div><div className="eyebrow">NEW USER</div><h2>Add user</h2></div></div>
   <p className="muted">Admin and Treasurer can manage users. Council users have read-only access.</p>
   <form action={addUser} className="formgrid">
    <input name="full_name" placeholder="Full name" required/>
    <input name="email" type="email" placeholder="Email address" required/>
    <select name="role" defaultValue="council"><option value="council">Council — read only</option><option value="treasurer">Treasurer — finance access</option><option value="admin">Admin — full access</option></select>
    <input name="password" type="password" minLength={8} placeholder="Temporary password (8+ characters)" required/>
    <button type="submit">Create user</button>
   </form>
  </section>

  <section className="panel">
   <div className="panelHead"><div><div className="eyebrow">ACCESS</div><h2>Current users</h2></div></div>
   <table>
    <thead><tr><th>User</th><th>Email</th><th>Role</th><th>Change access</th><th>Password</th><th>Remove</th></tr></thead>
    <tbody>{profiles?.map((p:any)=><tr key={p.id}>
     <td>{p.full_name||"—"}</td><td>{p.email}</td><td><span className="status">{p.role}</span></td>
     <td><form action={updateUser} className="inlineForm"><input type="hidden" name="id" value={p.id}/><input name="full_name" defaultValue={p.full_name||""} aria-label="Full name"/><select name="role" defaultValue={p.role}><option value="council">Council</option><option value="treasurer">Treasurer</option><option value="admin">Admin</option></select><button type="submit">Save</button></form></td>
     <td><form action={resetPassword} className="inlineForm"><input type="hidden" name="id" value={p.id}/><input name="password" type="password" minLength={8} placeholder="New temporary password" required/><button type="submit" className="secondary">Reset</button></form></td>
     <td><form action={deleteUser}><input type="hidden" name="id" value={p.id}/><button type="submit" className="linkbutton">Delete</button></form></td>
    </tr>)}</tbody>
   </table>
  </section>
 </>;
}
