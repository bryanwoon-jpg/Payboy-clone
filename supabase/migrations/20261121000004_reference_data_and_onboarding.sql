-- Payboy Clone: CPF reference data, Singapore public holidays, onboarding RPCs

-- ---------------------------------------------------------------------------
-- CPF ceilings (cpf.gov.sg)
-- ---------------------------------------------------------------------------
insert into public.cpf_ceilings (effective_from, ow_ceiling, annual_ceiling) values
  ('2025-01-01', 7400, 102000),
  ('2026-01-01', 8000, 102000)
on conflict (effective_from) do nothing;

-- ---------------------------------------------------------------------------
-- CPF rates for wages above $750 (employer share = total - employee)
-- Citizens and PRs from their 3rd year share one table.
-- ---------------------------------------------------------------------------
insert into public.cpf_rates (residency, age_above, age_upto, effective_from, total_rate, employee_rate)
select r.residency::public.residency_status, v.age_above, v.age_upto, v.effective_from::date, v.total_rate, v.employee_rate
from (values ('citizen'), ('pr')) as r(residency)
cross join (values
  -- 2025
  (0, 55, '2025-01-01', 0.370, 0.200),
  (55, 60, '2025-01-01', 0.325, 0.170),
  (60, 65, '2025-01-01', 0.235, 0.115),
  (65, 70, '2025-01-01', 0.165, 0.075),
  (70, null, '2025-01-01', 0.125, 0.050),
  -- 2026
  (0, 55, '2026-01-01', 0.370, 0.200),
  (55, 60, '2026-01-01', 0.340, 0.180),
  (60, 65, '2026-01-01', 0.250, 0.125),
  (65, 70, '2026-01-01', 0.165, 0.075),
  (70, null, '2026-01-01', 0.125, 0.050),
  -- 2027 (announced senior worker increases)
  (0, 55, '2027-01-01', 0.370, 0.200),
  (55, 60, '2027-01-01', 0.355, 0.190),
  (60, 65, '2027-01-01', 0.260, 0.130),
  (65, 70, '2027-01-01', 0.165, 0.075),
  (70, null, '2027-01-01', 0.125, 0.050)
) as v(age_above, age_upto, effective_from, total_rate, employee_rate)
on conflict do nothing;

-- PRs in their 1st and 2nd year: graduated rates (G/G), unchanged since 2016
insert into public.cpf_rates (residency, age_above, age_upto, effective_from, total_rate, employee_rate) values
  ('pr_1', 0, 55, '2016-01-01', 0.090, 0.050),
  ('pr_1', 55, 60, '2016-01-01', 0.090, 0.050),
  ('pr_1', 60, 65, '2016-01-01', 0.085, 0.050),
  ('pr_1', 65, null, '2016-01-01', 0.085, 0.050),
  ('pr_2', 0, 55, '2016-01-01', 0.240, 0.150),
  ('pr_2', 55, 60, '2016-01-01', 0.185, 0.125),
  ('pr_2', 60, 65, '2016-01-01', 0.110, 0.075),
  ('pr_2', 65, null, '2016-01-01', 0.085, 0.050)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Singapore gazetted public holidays (mom.gov.sg)
-- ---------------------------------------------------------------------------
insert into public.public_holidays (company_id, holiday_date, name) values
  (null, '2026-01-01', 'New Year''s Day'),
  (null, '2026-02-17', 'Chinese New Year'),
  (null, '2026-02-18', 'Chinese New Year'),
  (null, '2026-03-21', 'Hari Raya Puasa'),
  (null, '2026-04-03', 'Good Friday'),
  (null, '2026-05-01', 'Labour Day'),
  (null, '2026-05-27', 'Hari Raya Haji'),
  (null, '2026-05-31', 'Vesak Day'),
  (null, '2026-06-01', 'Vesak Day (observed)'),
  (null, '2026-08-09', 'National Day'),
  (null, '2026-08-10', 'National Day (observed)'),
  (null, '2026-11-08', 'Deepavali'),
  (null, '2026-11-09', 'Deepavali (observed)'),
  (null, '2026-12-25', 'Christmas Day'),
  (null, '2027-01-01', 'New Year''s Day'),
  (null, '2027-02-06', 'Chinese New Year'),
  (null, '2027-02-07', 'Chinese New Year'),
  (null, '2027-02-08', 'Chinese New Year (observed)'),
  (null, '2027-03-10', 'Hari Raya Puasa'),
  (null, '2027-03-26', 'Good Friday'),
  (null, '2027-05-01', 'Labour Day'),
  (null, '2027-05-17', 'Hari Raya Haji'),
  (null, '2027-05-20', 'Vesak Day'),
  (null, '2027-08-09', 'National Day'),
  (null, '2027-10-28', 'Deepavali'),
  (null, '2027-12-25', 'Christmas Day')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.next_working_day(p_company uuid, p_from date)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := p_from;
begin
  while private.business_days(p_company, v_day, v_day) = 0 loop
    v_day := v_day + 1;
  end loop;
  return v_day;
end;
$$;

-- ---------------------------------------------------------------------------
-- Onboarding: the first signed-in user creates a company and becomes owner
-- ---------------------------------------------------------------------------
create or replace function public.create_company(
  p_company_name text,
  p_full_name text,
  p_uen text default null,
  p_job_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_company uuid;
  v_department uuid;
  v_employee uuid;
begin
  if v_uid is null then
    raise exception 'Sign in first';
  end if;
  if exists (select 1 from public.employees where user_id = v_uid) then
    raise exception 'You already belong to a company';
  end if;
  if coalesce(trim(p_company_name), '') = '' or coalesce(trim(p_full_name), '') = '' then
    raise exception 'Company name and your name are required';
  end if;

  select lower(email) into v_email from auth.users where id = v_uid;

  perform set_config('app.bypass_guards', 'on', true);

  insert into public.companies (name, uen, created_by)
  values (trim(p_company_name), nullif(trim(p_uen), ''), v_uid)
  returning id into v_company;

  insert into public.departments (company_id, name) values (v_company, 'General')
  returning id into v_department;

  insert into public.employees (company_id, user_id, employee_code, full_name, email, job_title, department_id, role)
  values (v_company, v_uid, 'E001', trim(p_full_name), v_email, coalesce(nullif(trim(p_job_title), ''), 'Founder'), v_department, 'owner')
  returning id into v_employee;

  insert into public.employee_compensation (employee_id, company_id, basic_salary)
  values (v_employee, v_company, 0);

  insert into public.leave_types (company_id, name, code, color, default_entitlement, is_paid, requires_attachment, allow_half_day, carry_forward_limit) values
    (v_company, 'Annual leave', 'AL', '#234E8C', 14, true, false, true, 5),
    (v_company, 'Sick leave', 'MC', '#2F7D4F', 14, true, true, true, 0),
    (v_company, 'Hospitalisation leave', 'HL', '#6B4FA0', 60, true, true, false, 0),
    (v_company, 'Childcare leave', 'CCL', '#C2702A', 6, true, false, true, 0),
    (v_company, 'Compassionate leave', 'CL', '#5B6B7A', 3, true, false, false, 0),
    (v_company, 'Unpaid leave', 'NPL', '#9AA5B1', null, false, false, true, 0);

  insert into public.claim_categories (company_id, name, monthly_limit, requires_receipt) values
    (v_company, 'Transport', null, true),
    (v_company, 'Meals and entertainment', 200, true),
    (v_company, 'Medical', 300, true),
    (v_company, 'Mobile phone', 50, true),
    (v_company, 'Business travel', null, true),
    (v_company, 'Other', null, true);

  return v_company;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sample data so a new company can try every feature straight away
-- ---------------------------------------------------------------------------
create or replace function public.load_sample_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company uuid := private.my_company_id();
  v_owner uuid := private.my_employee_id();
  v_ops uuid;
  v_sales uuid;
  v_fin uuid;
  v_retail uuid;
  v_aisha uuid;
  v_daniel uuid;
  v_priya uuid;
  v_marcus uuid;
  v_weiling uuid;
  v_juan uuid;
  v_al uuid;
  v_mc uuid;
  v_npl uuid;
  v_transport uuid;
  v_meals uuid;
  v_travel uuid;
  v_month_start date := date_trunc('month', current_date)::date;
begin
  if v_company is null or not private.is_admin_of(v_company) then
    raise exception 'Only admins can load sample data';
  end if;
  if exists (select 1 from public.employees where company_id = v_company and email like '%@sample.payboy.dev') then
    raise exception 'Sample data is already loaded';
  end if;

  perform set_config('app.bypass_guards', 'on', true);

  insert into public.departments (company_id, name) values (v_company, 'Operations') on conflict (company_id, name) do update set name = excluded.name returning id into v_ops;
  insert into public.departments (company_id, name) values (v_company, 'Sales') on conflict (company_id, name) do update set name = excluded.name returning id into v_sales;
  insert into public.departments (company_id, name) values (v_company, 'Finance') on conflict (company_id, name) do update set name = excluded.name returning id into v_fin;
  insert into public.departments (company_id, name) values (v_company, 'Retail') on conflict (company_id, name) do update set name = excluded.name returning id into v_retail;

  insert into public.employees (company_id, employee_code, full_name, email, phone, job_title, department_id, manager_id, role, residency, date_of_birth, hire_date)
  values (v_company, 'S101', 'Aisha Rahman', 'aisha.rahman@sample.payboy.dev', '+65 9123 4501', 'Operations Manager', v_ops, v_owner, 'manager', 'citizen', '1985-04-12', '2021-03-01')
  returning id into v_aisha;

  insert into public.employees (company_id, employee_code, full_name, email, phone, job_title, department_id, manager_id, role, residency, date_of_birth, hire_date)
  values (v_company, 'S102', 'Daniel Tan', 'daniel.tan@sample.payboy.dev', '+65 9123 4502', 'Retail Associate', v_retail, v_aisha, 'employee', 'citizen', '1999-09-03', '2024-06-17')
  returning id into v_daniel;

  insert into public.employees (company_id, employee_code, full_name, email, phone, job_title, department_id, manager_id, role, residency, date_of_birth, hire_date)
  values (v_company, 'S103', 'Priya Nair', 'priya.nair@sample.payboy.dev', '+65 9123 4503', 'Sales Executive', v_sales, v_owner, 'employee', 'pr', '1992-01-25', '2022-08-01')
  returning id into v_priya;

  insert into public.employees (company_id, employee_code, full_name, email, phone, job_title, department_id, manager_id, role, residency, date_of_birth, hire_date)
  values (v_company, 'S104', 'Marcus Lim', 'marcus.lim@sample.payboy.dev', '+65 9123 4504', 'Finance Executive', v_fin, v_owner, 'employee', 'citizen', '1966-07-30', '2019-01-07')
  returning id into v_marcus;

  insert into public.employees (company_id, employee_code, full_name, email, phone, job_title, department_id, manager_id, role, residency, date_of_birth, hire_date)
  values (v_company, 'S105', 'Chua Wei Ling', 'weiling.chua@sample.payboy.dev', '+65 9123 4505', 'Senior Retail Associate', v_retail, v_aisha, 'employee', 'pr_2', '1995-11-18', '2023-02-13')
  returning id into v_weiling;

  insert into public.employees (company_id, employee_code, full_name, email, phone, job_title, department_id, manager_id, role, employment_type, residency, date_of_birth, hire_date)
  values (v_company, 'S106', 'Juan Santos', 'juan.santos@sample.payboy.dev', '+65 9123 4506', 'Visual Merchandiser', v_retail, v_aisha, 'employee', 'contract', 'foreigner', '1994-05-09',
          private.next_working_day(v_company, v_month_start + 7))
  returning id into v_juan;

  insert into public.employee_compensation (employee_id, company_id, basic_salary, bank_name, bank_account_name, bank_account_no) values
    (v_aisha, v_company, 6800, 'DBS', 'Aisha Rahman', '000-00001-1'),
    (v_daniel, v_company, 3200, 'OCBC', 'Daniel Tan', '000-00002-2'),
    (v_priya, v_company, 4500, 'UOB', 'Priya Nair', '000-00003-3'),
    (v_marcus, v_company, 5200, 'DBS', 'Marcus Lim', '000-00004-4'),
    (v_weiling, v_company, 3600, 'POSB', 'Chua Wei Ling', '000-00005-5'),
    (v_juan, v_company, 4200, 'Standard Chartered', 'Juan Santos', '000-00006-6');

  insert into public.recurring_pay_items (company_id, employee_id, name, kind, amount, cpf_applicable) values
    (v_company, v_aisha, 'Transport allowance', 'earning', 200, true),
    (v_company, v_priya, 'Mobile allowance', 'earning', 50, true),
    (v_company, v_daniel, 'Staff loan repayment', 'deduction', 100, false);

  select id into v_al from public.leave_types where company_id = v_company and code = 'AL';
  select id into v_mc from public.leave_types where company_id = v_company and code = 'MC';
  select id into v_npl from public.leave_types where company_id = v_company and code = 'NPL';

  insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, reason, status, approver_id, decided_at)
  values (v_company, v_daniel, v_al,
          private.next_working_day(v_company, v_month_start + 2), private.next_working_day(v_company, v_month_start + 2),
          'Family event', 'approved', v_aisha, now());

  insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, reason)
  values (v_company, v_priya, v_al,
          private.next_working_day(v_company, current_date + 10), private.next_working_day(v_company, current_date + 10),
          'Long weekend trip');

  insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, half_day, reason, status, approver_id, decided_at)
  values (v_company, v_weiling, v_mc,
          private.next_working_day(v_company, v_month_start + 4), private.next_working_day(v_company, v_month_start + 4),
          'am', 'Clinic visit', 'approved', v_aisha, now());

  insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, reason, status, approver_id, decided_at)
  values (v_company, v_juan, v_npl,
          private.next_working_day(v_company, v_month_start + 14), private.next_working_day(v_company, v_month_start + 14),
          'Personal matters', 'approved', v_aisha, now());

  insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, reason)
  values (v_company, v_marcus, v_al,
          private.next_working_day(v_company, current_date + 3), private.next_working_day(v_company, current_date + 4),
          'Visiting relatives in Penang');

  select id into v_transport from public.claim_categories where company_id = v_company and name = 'Transport';
  select id into v_meals from public.claim_categories where company_id = v_company and name = 'Meals and entertainment';
  select id into v_travel from public.claim_categories where company_id = v_company and name = 'Business travel';

  insert into public.claims (company_id, employee_id, category_id, expense_date, merchant, description, amount) values
    (v_company, v_daniel, v_transport, greatest(v_month_start, current_date - 3), 'Grab', 'Taxi to Jurong Point store for stock count', 24.50),
    (v_company, v_marcus, v_travel, greatest(v_month_start, current_date - 6), 'Singapore Airlines', 'Return flight to Kuala Lumpur for supplier audit', 320.00);

  insert into public.claims (company_id, employee_id, category_id, expense_date, merchant, description, amount, status, approver_id, decided_at) values
    (v_company, v_priya, v_meals, greatest(v_month_start, current_date - 8), 'Paradise Dynasty', 'Client lunch with Takashimaya buyers', 68.00, 'approved', v_owner, now()),
    (v_company, v_aisha, v_transport, greatest(v_month_start, current_date - 5), 'ComfortDelGro', 'Late-night store closing, taxi home', 42.00, 'approved', v_owner, now());
end;
$$;

revoke execute on function public.create_company(text, text, text, text) from anon, public;
revoke execute on function public.load_sample_data() from anon, public;
revoke execute on function public.preview_leave_days(date, date, public.half_day) from anon, public;
grant execute on function public.create_company(text, text, text, text) to authenticated;
grant execute on function public.load_sample_data() to authenticated;
grant execute on function public.preview_leave_days(date, date, public.half_day) to authenticated;
grant execute on function private.next_working_day(uuid, date) to authenticated;
