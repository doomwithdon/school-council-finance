# School Council Finance

Private web application for St. Elizabeth Seton School Council finances.

## Features
- Supabase email/password login
- Admin, Treasurer and read-only Council roles
- Live financial dashboard
- Budget vs actual report by GL
- Bank transaction entry
- Cheque register and clearing
- Bank reconciliation workflow
- Fundraiser revenue, expense and profit tracking
- Excel import based on the existing council workbook
- Audit log
- Full in-app database backup/restore
- Daily and manual budget snapshots
- Admin point-in-time budget restore with automatic pre-restore recovery snapshot

## Stack
Next.js + Supabase/PostgreSQL, designed for Vercel hosting.

## Setup
See `docs/SETUP.md`. Run `supabase/full-schema.sql` for a new database.

## Excel template
The importer expects `GL Codes`, `Budget Detail`, `Actual Detail`, `Bank Transactions`, and `Cheque Register`. The original financial workbook is excluded from Git.

## Backup note
In-app backups support application-level rollback but should not be the only disaster-recovery mechanism. Enable managed database backups/PITR with the database provider as appropriate.
