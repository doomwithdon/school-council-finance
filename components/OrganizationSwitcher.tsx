import {switchOrganization} from "../app/organizations/actions";
import type {OrganizationChoice} from "../lib/organization";

export default function OrganizationSwitcher({active,organizations}:{
 active:OrganizationChoice;organizations:OrganizationChoice[];
}){
 if(organizations.length<2)return <div className="orgIdentity"><strong>{active.name}</strong><small>{active.role}</small></div>;
 return <form action={switchOrganization} className="orgSwitchForm">
  <label htmlFor="organization_id">Organization</label>
  <select name="organization_id" id="organization_id" defaultValue={active.id}>
   {organizations.map(o=><option key={o.id} value={o.id}>{o.name} ({o.role})</option>)}
  </select>
  <button type="submit" className="secondary">Switch</button>
 </form>;
}
