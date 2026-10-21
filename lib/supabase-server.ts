import {cookies} from "next/headers";
import {createServerClient} from "@supabase/ssr";

type CookieToSet={name:string;value:string;options?:Parameters<ReturnType<typeof cookies>["set"]>[2]};

export function serverDb(){
  const c=cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies:{
        getAll(){return c.getAll()},
        setAll(items:CookieToSet[]){
          try{items.forEach(({name,value,options})=>c.set(name,value,options))}
          catch{}
        }
      }
    }
  );
}
