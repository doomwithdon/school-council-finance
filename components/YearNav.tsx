"use client";

import {useRouter} from "next/navigation";

export default function YearNav({
  years,
  current,
  path
}:{years:any[];current:string;path:string}){
  const router=useRouter();

  return (
    <div className="yearnav">
      <label>
        Financial year
        <select
          name="year"
          value={current}
          onChange={(e)=>router.push(path+"?year="+encodeURIComponent(e.target.value))}
        >
          {years.map(y=>(
            <option key={y.id} value={y.label}>
              {y.label}{y.status==="closed"?" (Closed)":""}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
