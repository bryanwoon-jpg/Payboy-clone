# Payboy Clone

A Payboy / Gusto style HR app for Singapore SMEs: **payroll with CPF and SDL, leave management and expense claims**, built on Next.js 16 and Supabase.

## What it does

| Area | Features |
| --- | --- |
| Payroll | Monthly pay runs, prorated salary for joiners and leavers, unpaid leave deductions, recurring allowances and deductions, one-off adjustments (bonus as Additional Wages, overtime as Ordinary Wages), CPF employee and employer shares, SDL, draft → approved → paid workflow, bank file and CPF summary CSV exports |
| Payslips | Itemised payslips employees see once a run is approved, printable to PDF, year-to-date totals |
| Leave | Singapore leave types out of the box (annual, sick, hospitalisation, childcare, compassionate, unpaid), half days, balances with carry forward and adjustments, MOM public holidays 2026 and 2027 excluded from day counts, supporting documents, manager approval, team calendar |
| Claims | Categories with monthly caps and receipt rules, receipt uploads to private storage, manager approval, approved claims reimbursed automatically in the next pay run |
| People | Directory, departments, reporting lines, roles (owner, HR admin, manager, employee), compensation and bank details visible only to HR and the employee, offboarding |

## Stack

- **Next.js 16** (App Router, Server Actions, `proxy.ts`), React 19, Tailwind CSS 4
- **Supabase**: Postgres with row level security, Auth (email and password), Storage (private `attachments` bucket)
- Business rules live in the database (triggers and RPCs), so they hold no matter which client writes

## Database

Migrations are in [`supabase/migrations`](supabase/migrations) and are already applied to the Supabase project `payboy-clone` (ref `ipqvsvonmulccmlbqccv`, Singapore region).

| Table | Purpose |
| --- | --- |
| `companies` | Tenant. Payday, working days, UEN |
| `departments` | Per company |
| `employees` | Directory record, linked to `auth.users` by email when the person signs up. Role, manager, residency, date of birth (for CPF age bands) |
| `employee_compensation` | Basic salary and bank details. Only HR admins and the employee can read it |
| `recurring_pay_items` | Monthly allowances and deductions |
| `leave_types`, `leave_entitlements`, `leave_requests` | Leave setup, per-year balances, requests and approvals |
| `public_holidays` | MOM holidays (shared) plus company-specific days |
| `claim_categories`, `claims` | Claim setup and claims, linked to the pay run that reimburses them |
| `pay_runs`, `pay_run_adjustments`, `payslips`, `payslip_items` | Payroll |
| `cpf_rates`, `cpf_ceilings` | CPF Board rates (2025, 2026, 2027; graduated PR rates) and wage ceilings |

View: `leave_balances` (entitled, taken, pending per employee, type and year).

RPCs: `create_company`, `load_sample_data`, `create_pay_run`, `recalculate_pay_run`, `set_pay_run_status`, `preview_leave_days`, `calculate_cpf`.

Security model: every table has RLS. Helper functions in the non-exposed `private` schema decide who is an admin, who manages whom, and which pay runs are published. Triggers enforce approval rules (no approving your own request, only pending items can be decided, leave balance and overlap checks, claim monthly caps, receipts required).

## Run locally

```bash
cp .env.example .env.local   # already points at the payboy-clone Supabase project
npm install
npm run dev
```

Open http://localhost:3000, create an account, and set up your company. Tick "Add six sample employees" to get people, leave requests and claims to try approvals and a pay run immediately.

## Deploy to Vercel

1. Import this GitHub repo in Vercel (framework preset: Next.js, no build settings to change).
2. Add the two environment variables from `.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. Deploy.
4. In Supabase, go to **Authentication → URL Configuration** and set **Site URL** to your Vercel URL, and add `https://<your-app>.vercel.app/**` to **Redirect URLs**, so sign-up confirmation emails link back to the app.

Supabase's built-in email sender is rate limited and meant for testing. For real use, add your own SMTP provider under **Authentication → Emails**, or turn off email confirmation while trying things out.

## How payroll is calculated

For each employee employed during the month:

1. **Basic salary**, prorated by working days employed ÷ working days in the month (company working days, minus public holidays).
2. **Unpaid leave**: basic ÷ working days × approved unpaid leave days.
3. **Recurring allowances** (Ordinary Wages if marked CPF-able) and **one-off adjustments** (Ordinary or Additional Wages, or no CPF).
4. **CPF** using the CPF Board wage-band formulas for the employee's residency and age (age band changes the month after the birthday). Ordinary Wages are capped at the OW ceiling ($8,000 from 2026); Additional Wages are capped at the annual $102,000 ceiling less the year's OW subject to CPF. Total is rounded to the nearest dollar, the employee share rounded down.
5. **SDL** at 0.25% of total wages, minimum $2, maximum $11.25.
6. **Net pay** = gross − employee CPF − deductions + approved claims.

## Not included yet

- Self-help group fund deductions (CDAC, MBMF, SINDA, ECF)
- IRAS IR8A and AIS submissions, CPF EZPay file format, bank-specific GIRO formats (the bank CSV is generic)
- Overtime calculation from timesheets, multi-currency, hourly pay
- Automatic yearly leave carry-forward (adjust entitlements per employee for now)

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript checks |
| `npm run db:types` | Regenerate Supabase TypeScript types (needs `supabase login`) |
