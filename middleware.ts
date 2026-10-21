import {NextResponse,type NextRequest} from "next/server";
import {createServerClient} from "@supabase/ssr";

type CookieToSet={
  name:string;
  value:string;
  options?:Parameters<NextResponse["cookies"]["set"]>[2];
};

export async function middleware(req:NextRequest){
  if(req.nextUrl.pathname.startsWith("/api/cron/"))return NextResponse.next();

  let res=NextResponse.next({request:req});
  const db=createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies:{
        getAll:()=>req.cookies.getAll(),
        setAll(items:CookieToSet[]){
          items.forEach(({name,value})=>req.cookies.set(name,value));
          res=NextResponse.next({request:req});
          items.forEach(({name,value,options})=>res.cookies.set(name,value,options));
        }
      }
    }
  );
  const {data:{user}}=await db.auth.getUser();
  if(!user&&!req.nextUrl.pathname.startsWith("/login"))
    return NextResponse.redirect(new URL("/login",req.url));
  return res;
}

export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
