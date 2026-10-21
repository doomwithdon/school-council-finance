# Production setup

## 1. Supabase
Create a Supabase project and run `supabase/full-schema.sql`.

Create the first user in Supabase Authentication, then add its profile as Admin:

```sql
insert into public.profiles(id,email,full_name,role)
select id,email,'Initial Administrator','admin'::public.app_role
from auth.users where email='YOUR_EMAIL';
```

Subsequent users can be created in Supabase Auth and assigned `admin`, `treasurer`, or `council` in `profiles`.

## 2. Environment
Set:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY (server only)
- CRON_SECRET

## 3. Daily budget history
`vercel.json` invokes the protected daily snapshot endpoint at 05:15 UTC. Vercel Cron supplies `CRON_SECRET` authorization when configured. Adjust the UTC schedule if a different local cutoff is desired.

## 4. Import
Sign in as Admin/Treasurer and import the existing Excel workbook. Review counts/warnings before confirming.

## 5. Safety
- Council users are read-only.
- Budget restore is Admin-only.
- Full database restore is Admin-only and requires typing RESTORE.
- A budget snapshot is created before restore operations.
- Full backups are stored in the database. For disaster recovery outside Supabase, also enable provider/platform database backups.
