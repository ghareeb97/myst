# Myst

Myst is a mobile-first web app MVP for product, stock, and invoice management.

## Stack

- Next.js (App Router, TypeScript)
- Supabase (Auth + Postgres)

## Core MVP Behavior

- Invoices deduct stock automatically on confirmation.
- Stock can go negative.
- Low-stock alerts are based on per-product threshold or global default.
- Payment statuses: Paid, Partially Paid, Unpaid (default is Paid).

## Local Setup

1. Copy `.env.example` to `.env.local`.
2. Fill Supabase keys.
3. Install dependencies: `npm install`
4. Run dev server: `npm run dev`

## Database

- SQL migrations are under `supabase/migrations`.
- Seed users script: `npm run seed:users`

## Deployment

See `DEPLOY.md`.
