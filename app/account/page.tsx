import { currentUser } from "../../lib/auth";
import { changePassword } from "./actions";

export default async function AccountPage({searchParams}:{searchParams?:{error?:string;success?:string}}){
 const {user,profile}=await currentUser();
 return <>
  <section className="pageHeader"><div><div className="eyebrow">ACCOUNT</div><h1>My account</h1><p>Manage your Seton Council Finance account.</p></div></section>
  <section className="panel accountPanel">
   <div className="panelHead"><div><div className="eyebrow">PROFILE</div><h2>{profile?.full_name||user.email}</h2></div><span className="status">{profile?.role||"council"}</span></div>
   <div className="statRow"><span>Email</span><b>{user.email}</b></div>
   <div className="statRow"><span>Role</span><b>{profile?.role||"council"}</b></div>
  </section>
  <section className="panel accountPanel">
   <div className="panelHead"><div><div className="eyebrow">SECURITY</div><h2>Change password</h2></div></div>
   {searchParams?.error&&<p className="bad">{searchParams.error}</p>}
   {searchParams?.success&&<p className="ok">{searchParams.success}</p>}
   <form action={changePassword} className="passwordForm">
    <label>Current password<input name="current_password" type="password" autoComplete="current-password" required/></label>
    <label>New password<input name="new_password" type="password" minLength={8} autoComplete="new-password" required/></label>
    <label>Confirm new password<input name="confirm_password" type="password" minLength={8} autoComplete="new-password" required/></label>
    <button type="submit">Change password</button>
   </form>
  </section>
 </>;
}
