# School Council Finance

Private web application for managing St. Elizabeth Seton School Council finances.

## MVP features
- Budget vs actual data model using school GL codes
- Bank transaction ledger
- Cheque register and cleared dates
- Excel migration/import based on the existing council workbook
- Two-stage Excel import: local preview/validation, then confirmed database import
- Supabase/PostgreSQL schema with RLS enabled

## Excel template
The importer expects: `GL Codes`, `Budget Detail`, `Actual Detail`, `Bank Transactions`, and `Cheque Register`. Formula/report sheets are not persisted; reports are generated from normalized records. The original workbook is excluded by `.gitignore`.

## Run locally
1. Create a Supabase project.
2. Run `supabase/schema.sql` in its SQL editor.
3. Copy `.env.example` to `.env.local` and set the Supabase values.
4. Run `npm install` and `npm run dev`.
5. Open `/import`, choose the existing workbook, review validation, and confirm.

## Hosting
Designed for Vercel + Supabase. Never expose the service-role key client-side.

## Security milestone
Before production use, add Supabase Auth and role-based access (treasurer/admin write, council read-only). Do not expose the import API publicly without authentication.
