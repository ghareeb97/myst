# Myst Deployment Runbook

## 1) Prerequisites

- Supabase project (production)
- Vercel project connected to repository
- Custom domain (optional)

## 2) Environment Variables

Set these in Vercel Project Settings -> Environment Variables:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-only) |
| `APP_CURRENCY` | `EGP` |
| `APP_TIMEZONE` | `Africa/Cairo` |

## 3) Apply Database Migration

From your local machine with Supabase CLI authenticated:

```bash
supabase link --project-ref <PROJECT_REF>
supabase db push
```

This applies:

- Schema, enums, constraints
- RLS policies
- SQL functions (`create_invoice`, `void_invoice`, `update_invoice_payment`)
- Default settings row

## 4) Seed Employee Accounts (3 users)

Run:

```bash
MYST_SEED_PASSWORD='ChangeMe!123' npm run seed:users
```

Users created:

- `manager@myst.local` (manager)
- `sales1@myst.local` (sales)
- `sales2@myst.local` (sales)

Change passwords immediately in production.

## 5) Vercel Deployment

1. Import repository in Vercel.
2. Set all environment variables for `Production`, `Preview`, and `Development`.
3. Set production branch to `main`.
4. Deploy.

Vercel automatically creates:

- Preview deployments on pull requests
- Production deployments on merges to `main`

## 6) Post-Deploy Smoke Tests

1. Login with manager and sales accounts.
2. Create products (manager).
3. Create invoice (sales) and verify stock deduction.
4. Confirm stock can go negative.
5. Verify low-stock page and dashboard low-stock count.
6. Set paid amount to 0 and verify status becomes `Unpaid`.
7. Set partial paid amount and verify `Partially Paid`.
8. Void invoice (manager) and verify stock is restored.

## 7) Backups and Monitoring

- Enable Supabase backups / PITR.
- Monitor:
  - Supabase logs (database/auth errors)
  - Vercel function logs (API route failures)

## 8) Rollback Guidance

- Database rollback: use migration rollback strategy or restore from backup.
- App rollback: redeploy previous Vercel deployment from dashboard.
