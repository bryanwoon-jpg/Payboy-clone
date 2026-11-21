-- Payboy Clone: core schema
-- Multi-tenant HRM: companies, employees, leave, claims, payroll (Singapore CPF/SDL)

create schema if not exists private;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('owner', 'admin', 'manager', 'employee');
create type public.employment_type as enum ('full_time', 'part_time', 'contract', 'intern');
create type public.residency_status as enum ('citizen', 'pr', 'pr_1', 'pr_2', 'foreigner');
create type public.employee_status as enum ('active', 'terminated');
create type public.request_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create type public.claim_status as enum ('pending', 'approved', 'rejected', 'cancelled', 'paid');
create type public.pay_run_status as enum ('draft', 'approved', 'paid');
create type public.pay_item_kind as enum ('earning', 'deduction');
create type public.cpf_wage_type as enum ('ow', 'aw', 'none');
create type public.half_day as enum ('none', 'am', 'pm');

-- ---------------------------------------------------------------------------
-- Generic updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Companies & org structure
-- ---------------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  uen text,
  address text,
  industry text,
  currency text not null default 'SGD',
  payday smallint not null default 28 check (payday between 1 and 31),
  -- ISO day-of-week numbers counted as working days (1 = Mon ... 7 = Sun)
  work_days smallint[] not null default '{1,2,3,4,5}',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid unique references auth.users (id) on delete set null,
  employee_code text,
  full_name text not null check (length(trim(full_name)) > 0),
  email text not null check (email = lower(email)),
  phone text,
  job_title text,
  department_id uuid references public.departments (id) on delete set null,
  manager_id uuid references public.employees (id) on delete set null,
  role public.app_role not null default 'employee',
  employment_type public.employment_type not null default 'full_time',
  residency public.residency_status not null default 'citizen',
  date_of_birth date,
  hire_date date not null default current_date,
  termination_date date,
  status public.employee_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, email),
  unique (company_id, employee_code),
  check (manager_id is null or manager_id <> id),
  check (termination_date is null or termination_date >= hire_date)
);
create index employees_company_idx on public.employees (company_id);
create index employees_manager_idx on public.employees (manager_id);
create index employees_department_idx on public.employees (department_id);

-- Sensitive pay data lives in its own table so the directory can be shared
create table public.employee_compensation (
  employee_id uuid primary key references public.employees (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  basic_salary numeric(12, 2) not null default 0 check (basic_salary >= 0),
  bank_name text,
  bank_account_name text,
  bank_account_no text,
  updated_at timestamptz not null default now()
);
create index employee_compensation_company_idx on public.employee_compensation (company_id);

-- Fixed monthly allowances and deductions (e.g. transport allowance, loan repayment)
create table public.recurring_pay_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  name text not null,
  kind public.pay_item_kind not null,
  amount numeric(12, 2) not null check (amount >= 0),
  -- Earnings only: whether the amount counts as ordinary wages for CPF
  cpf_applicable boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index recurring_pay_items_employee_idx on public.recurring_pay_items (employee_id);
create index recurring_pay_items_company_idx on public.recurring_pay_items (company_id);

-- ---------------------------------------------------------------------------
-- Leave
-- ---------------------------------------------------------------------------
create table public.leave_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  code text not null,
  color text not null default '#234E8C',
  -- null = unlimited (e.g. unpaid leave)
  default_entitlement numeric(5, 1),
  is_paid boolean not null default true,
  requires_attachment boolean not null default false,
  allow_half_day boolean not null default true,
  carry_forward_limit numeric(5, 1) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, code)
);

create table public.leave_entitlements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  entitled numeric(5, 1) not null default 0,
  carried_forward numeric(5, 1) not null default 0,
  adjustment numeric(5, 1) not null default 0,
  unique (employee_id, leave_type_id, year)
);
create index leave_entitlements_company_idx on public.leave_entitlements (company_id);
create index leave_entitlements_type_idx on public.leave_entitlements (leave_type_id);

create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  -- null company_id = national holiday shared by every company
  company_id uuid references public.companies (id) on delete cascade,
  holiday_date date not null,
  name text not null,
  unique nulls not distinct (company_id, holiday_date, name)
);
create index public_holidays_date_idx on public.public_holidays (holiday_date);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  leave_type_id uuid not null references public.leave_types (id) on delete restrict,
  start_date date not null,
  end_date date not null,
  half_day public.half_day not null default 'none',
  days numeric(5, 1) not null default 0,
  reason text,
  attachment_path text,
  status public.request_status not null default 'pending',
  approver_id uuid references public.employees (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date),
  check (half_day = 'none' or start_date = end_date),
  check (extract(year from start_date) = extract(year from end_date))
);
create index leave_requests_company_idx on public.leave_requests (company_id, status);
create index leave_requests_employee_idx on public.leave_requests (employee_id, start_date);
create index leave_requests_type_idx on public.leave_requests (leave_type_id);
create index leave_requests_approver_idx on public.leave_requests (approver_id);

-- ---------------------------------------------------------------------------
-- Payroll (declared before claims so claims can reference pay runs)
-- ---------------------------------------------------------------------------
create table public.cpf_rates (
  id serial primary key,
  residency public.residency_status not null,
  age_above integer not null,           -- exclusive lower bound
  age_upto integer,                     -- inclusive upper bound, null = no limit
  effective_from date not null,
  total_rate numeric(6, 4) not null,    -- for wages > $750
  employee_rate numeric(6, 4) not null, -- for wages > $750
  unique (residency, age_above, effective_from)
);

create table public.cpf_ceilings (
  effective_from date primary key,
  ow_ceiling numeric(12, 2) not null,
  annual_ceiling numeric(12, 2) not null
);

create table public.pay_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  period_start date not null,
  period_end date not null,
  pay_date date not null,
  status public.pay_run_status not null default 'draft',
  employee_count integer not null default 0,
  total_gross numeric(14, 2) not null default 0,
  total_deductions numeric(14, 2) not null default 0,
  total_reimbursements numeric(14, 2) not null default 0,
  total_employee_cpf numeric(14, 2) not null default 0,
  total_employer_cpf numeric(14, 2) not null default 0,
  total_sdl numeric(14, 2) not null default 0,
  total_net numeric(14, 2) not null default 0,
  created_by uuid references public.employees (id) on delete set null,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, period_start),
  check (period_end >= period_start)
);
create index pay_runs_created_by_idx on public.pay_runs (created_by);

-- One-off items an admin adds to a draft pay run (bonus, overtime, penalty...)
create table public.pay_run_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  pay_run_id uuid not null references public.pay_runs (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  label text not null,
  kind public.pay_item_kind not null,
  amount numeric(12, 2) not null check (amount > 0),
  cpf_type public.cpf_wage_type not null default 'ow',
  created_at timestamptz not null default now()
);
create index pay_run_adjustments_run_idx on public.pay_run_adjustments (pay_run_id);
create index pay_run_adjustments_employee_idx on public.pay_run_adjustments (employee_id);
create index pay_run_adjustments_company_idx on public.pay_run_adjustments (company_id);

create table public.payslips (
  id uuid primary key default gen_random_uuid(),
  pay_run_id uuid not null references public.pay_runs (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  basic_salary numeric(12, 2) not null default 0,
  prorated_basic numeric(12, 2) not null default 0,
  working_days numeric(5, 1) not null default 0,
  days_employed numeric(5, 1) not null default 0,
  unpaid_leave_days numeric(5, 1) not null default 0,
  unpaid_leave_deduction numeric(12, 2) not null default 0,
  ordinary_wages numeric(12, 2) not null default 0,
  additional_wages numeric(12, 2) not null default 0,
  gross_pay numeric(12, 2) not null default 0,
  total_deductions numeric(12, 2) not null default 0,
  reimbursements numeric(12, 2) not null default 0,
  employee_cpf numeric(12, 2) not null default 0,
  employer_cpf numeric(12, 2) not null default 0,
  sdl numeric(12, 2) not null default 0,
  net_pay numeric(12, 2) not null default 0,
  cpf_age integer,
  residency public.residency_status,
  created_at timestamptz not null default now(),
  unique (pay_run_id, employee_id)
);
create index payslips_employee_idx on public.payslips (employee_id);
create index payslips_company_idx on public.payslips (company_id);

create table public.payslip_items (
  id uuid primary key default gen_random_uuid(),
  payslip_id uuid not null references public.payslips (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  label text not null,
  kind text not null check (kind in ('earning', 'deduction', 'reimbursement')),
  amount numeric(12, 2) not null,
  cpf_type public.cpf_wage_type not null default 'none',
  source text not null check (source in ('basic', 'unpaid_leave', 'recurring', 'adjustment', 'claim')),
  source_id uuid,
  sort_order integer not null default 0
);
create index payslip_items_payslip_idx on public.payslip_items (payslip_id);
create index payslip_items_company_idx on public.payslip_items (company_id);

-- ---------------------------------------------------------------------------
-- Claims
-- ---------------------------------------------------------------------------
create table public.claim_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  monthly_limit numeric(12, 2) check (monthly_limit is null or monthly_limit > 0),
  requires_receipt boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete cascade,
  category_id uuid not null references public.claim_categories (id) on delete restrict,
  expense_date date not null,
  merchant text,
  description text,
  amount numeric(12, 2) not null check (amount > 0),
  currency text not null default 'SGD',
  receipt_path text,
  status public.claim_status not null default 'pending',
  approver_id uuid references public.employees (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  pay_run_id uuid references public.pay_runs (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index claims_company_idx on public.claims (company_id, status);
create index claims_employee_idx on public.claims (employee_id, expense_date);
create index claims_category_idx on public.claims (category_id);
create index claims_pay_run_idx on public.claims (pay_run_id);
create index claims_approver_idx on public.claims (approver_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger companies_updated_at before update on public.companies
  for each row execute function private.set_updated_at();
create trigger employees_updated_at before update on public.employees
  for each row execute function private.set_updated_at();
create trigger employee_compensation_updated_at before update on public.employee_compensation
  for each row execute function private.set_updated_at();
create trigger leave_requests_updated_at before update on public.leave_requests
  for each row execute function private.set_updated_at();
create trigger claims_updated_at before update on public.claims
  for each row execute function private.set_updated_at();
create trigger pay_runs_updated_at before update on public.pay_runs
  for each row execute function private.set_updated_at();
