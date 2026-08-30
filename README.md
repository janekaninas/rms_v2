# AASHA Villa Management Platform

Villa commercial, revenue reconciliation, operational expense, finance, and owner
reporting platform for Aasha Management. See `CLAUDE.md` and `docs/` for the
authoritative product spec, data model, financial logic, and implementation plan.

## Stack

Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui, Supabase (Postgres,
Auth), deployed on Vercel.

## Local development

```bash
npm install
cp .env.example .env.local   # fill in NEXT_PUBLIC_SUPABASE_ANON_KEY
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Running against a local Supabase stack

```bash
npx supabase start   # applies supabase/migrations/*.sql automatically
```

Copy the `API_URL` and `ANON_KEY` from the command's output into `.env.local`.

## Migrations

Schema lives in `supabase/migrations/`, applied in filename order. Apply to a
project with the Supabase CLI (`supabase db push`) or by running each file in
the Supabase SQL Editor.

## Status

Day 1 (foundation): project shell, Supabase Auth, schema + seed data for the
confirmed business rules, and the Configuration pages (Villas, Owners, Villa
Mapping, Channel Payment Rules, Tax Profiles, Revenue Targets, Settings). See
`docs/IMPLEMENTATION_PLAN.md` for the full day-by-day build sequence.
