-- Payboy Clone: helper functions, business-rule triggers and row level security

grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Session helpers (security definer so policies can use them without recursion)
-- ---------------------------------------------------------------------------
create or replace function private.bypass_guards()
returns boolean
language sql
stable
set search_path = ''
as $$
  -- True for trusted contexts: SQL editor / service role (no JWT) or
  -- inside one of our own security definer RPCs that opt in.
  select auth.uid() is null
      or coalesce(current_setting('app.bypass_guards', true), '') = 'on';
$$;

create or replace function private.my_employee_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.employees
  where user_id = (select auth.uid()) and status = 'active'
  limit 1;
$$;

create or replace function private.my_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select company_id from public.employees
  where user_id = (select auth.uid()) and status = 'active'
  limit 1;
$$;

create or replace function private.my_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.employees
  where user_id = (select auth.uid()) and status = 'active'
  limit 1;
$$;

create or replace function private.is_admin_of(p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.employees
    where user_id = (select auth.uid())
      and status = 'active'
      and company_id = p_company
      and role in ('owner', 'admin')
  );
$$;

create or replace function private.manages(p_employee uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.employees e
    join public.employees me on me.id = e.manager_id
    where e.id = p_employee
      and me.user_id = (select auth.uid())
      and me.status = 'active'
  );
$$;

create or replace function private.can_see_requests_of(p_employee uuid, p_company uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_employee = private.my_employee_id()
      or private.manages(p_employee)
      or private.is_admin_of(p_company);
$$;

create or replace function private.run_published(p_run uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select status in ('approved', 'paid') from public.pay_runs where id = p_run), false);
$$;

-- Attachment paths look like {company_id}/{employee_id}/{folder}/{file}
create or replace function private.can_see_attachment(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_path, '/');
  v_employee public.employees;
begin
  if array_length(v_parts, 1) < 3 then
    return false;
  end if;
  select * into v_employee from public.employees where id::text = v_parts[2] and company_id::text = v_parts[1];
  if not found then
    return false;
  end if;
  return private.can_see_requests_of(v_employee.id, v_employee.company_id);
end;
$$;

-- Working days between two dates (inclusive), skipping rest days and holidays
create or replace function private.business_days(p_company uuid, p_from date, p_to date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::numeric
  from generate_series(p_from, p_to, interval '1 day') as d
  join public.companies c on c.id = p_company
  where extract(isodow from d)::smallint = any (c.work_days)
    and not exists (
          select 1 from public.public_holidays h
          where h.holiday_date = d::date
            and (h.company_id is null or h.company_id = p_company)
        );
$$;

grant execute on all functions in schema private to authenticated;

-- Preview how many leave days a date range costs (used by the apply form)
create or replace function public.preview_leave_days(p_start date, p_end date, p_half_day public.half_day default 'none')
returns numeric
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_days numeric;
begin
  if p_start is null or p_end is null or p_end < p_start then
    return 0;
  end if;
  v_days := private.business_days(private.my_company_id(), p_start, p_end);
  if p_half_day <> 'none' then
    v_days := least(v_days, 0.5);
  end if;
  return v_days;
end;
$$;

-- ---------------------------------------------------------------------------
-- Employees: link to auth users, guard roles, keep references in-company
-- ---------------------------------------------------------------------------
create or replace function private.employees_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bypass boolean := private.bypass_guards();
  v_my_role public.app_role := private.my_role();
  v_owner_count integer;
begin
  new.email := lower(trim(new.email));

  if tg_op = 'UPDATE' and new.company_id <> old.company_id then
    raise exception 'Employees cannot be moved between companies';
  end if;

  if new.department_id is not null and not exists (
    select 1 from public.departments d where d.id = new.department_id and d.company_id = new.company_id
  ) then
    raise exception 'Department belongs to another company';
  end if;

  if new.manager_id is not null and not exists (
    select 1 from public.employees m where m.id = new.manager_id and m.company_id = new.company_id
  ) then
    raise exception 'Manager belongs to another company';
  end if;

  if not v_bypass then
    -- Only owners can grant or change owner/admin roles
    if (tg_op = 'INSERT' and new.role in ('owner', 'admin'))
       or (tg_op = 'UPDATE' and new.role <> old.role and (new.role in ('owner', 'admin') or old.role in ('owner', 'admin'))) then
      if v_my_role is distinct from 'owner' then
        raise exception 'Only the company owner can change admin roles';
      end if;
    end if;
    if tg_op = 'UPDATE' and old.role = 'owner' and v_my_role is distinct from 'owner' then
      raise exception 'Only the company owner can edit an owner';
    end if;
  end if;

  -- Never leave a company without an active owner
  if tg_op = 'UPDATE' and old.role = 'owner' and old.status = 'active'
     and (new.role <> 'owner' or new.status <> 'active') then
    select count(*) into v_owner_count
    from public.employees
    where company_id = old.company_id and role = 'owner' and status = 'active' and id <> old.id;
    if v_owner_count = 0 then
      raise exception 'A company needs at least one active owner';
    end if;
  end if;

  -- Link to an existing login with the same email
  if new.user_id is null then
    select u.id into new.user_id
    from auth.users u
    where lower(u.email) = new.email
      and not exists (select 1 from public.employees e where e.user_id = u.id and e.id <> new.id)
    limit 1;
  end if;

  if new.termination_date is not null and new.termination_date < current_date then
    new.status := 'terminated';
  end if;

  return new;
end;
$$;

create trigger employees_guard
  before insert or update on public.employees
  for each row execute function private.employees_guard();

-- When someone signs up, attach them to the employee record HR created for them
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.employees e
  set user_id = new.id
  where e.id = (
    select id from public.employees
    where email = lower(new.email) and user_id is null and status = 'active'
    order by created_at desc
    limit 1
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- Keep company_id on child rows in sync with the employee they belong to
create or replace function private.sync_company_from_employee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select company_id into new.company_id from public.employees where id = new.employee_id;
  if new.company_id is null then
    raise exception 'Employee not found';
  end if;
  return new;
end;
$$;

create trigger employee_compensation_company before insert or update on public.employee_compensation
  for each row execute function private.sync_company_from_employee();
create trigger recurring_pay_items_company before insert or update on public.recurring_pay_items
  for each row execute function private.sync_company_from_employee();
create trigger leave_entitlements_company before insert or update on public.leave_entitlements
  for each row execute function private.sync_company_from_employee();

-- ---------------------------------------------------------------------------
-- Leave requests: day count, balance, overlap and approval workflow
-- ---------------------------------------------------------------------------
create or replace function private.leave_requests_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bypass boolean := private.bypass_guards();
  v_me uuid := private.my_employee_id();
  v_type public.leave_types;
  v_dates_changed boolean;
  v_entitled numeric;
  v_used numeric;
  v_available numeric;
begin
  select company_id into new.company_id from public.employees where id = new.employee_id;
  if new.company_id is null then
    raise exception 'Employee not found';
  end if;

  select * into v_type from public.leave_types where id = new.leave_type_id and company_id = new.company_id;
  if not found then
    raise exception 'Leave type not found';
  end if;

  v_dates_changed := tg_op = 'INSERT'
    or new.start_date is distinct from old.start_date
    or new.end_date is distinct from old.end_date
    or new.half_day is distinct from old.half_day
    or new.leave_type_id is distinct from old.leave_type_id;

  if v_dates_changed then
    if new.half_day <> 'none' and not v_type.allow_half_day then
      raise exception '% cannot be taken as half days', v_type.name;
    end if;
    new.days := private.business_days(new.company_id, new.start_date, new.end_date);
    if new.half_day <> 'none' then
      new.days := least(new.days, 0.5);
    end if;
    if new.days <= 0 then
      raise exception 'The selected dates fall on rest days or public holidays';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if not v_bypass then
      new.status := 'pending';
      new.approver_id := null;
      new.decided_at := null;
      new.decision_note := null;
      if v_type.requires_attachment and new.attachment_path is null then
        raise exception '% needs a supporting document', v_type.name;
      end if;
    end if;
  else
    if new.employee_id <> old.employee_id then
      raise exception 'A leave request cannot change owner';
    end if;

    if new.status is distinct from old.status then
      if not v_bypass then
        if new.status = 'cancelled' then
          if old.status not in ('pending', 'approved') then
            raise exception 'Only pending or approved leave can be cancelled';
          end if;
          if not (old.employee_id = v_me or private.is_admin_of(old.company_id)) then
            raise exception 'You can only cancel your own leave';
          end if;
          if old.status = 'approved' and old.start_date <= current_date and not private.is_admin_of(old.company_id) then
            raise exception 'Leave that has already started can only be cancelled by an admin';
          end if;
        elsif new.status in ('approved', 'rejected') then
          if old.status <> 'pending' then
            raise exception 'Only pending requests can be approved or rejected';
          end if;
          if not (private.is_admin_of(old.company_id) or private.manages(old.employee_id)) then
            raise exception 'You are not allowed to decide on this request';
          end if;
          if old.employee_id = v_me and private.my_role() is distinct from 'owner' then
            raise exception 'You cannot approve your own request';
          end if;
          new.approver_id := v_me;
          new.decided_at := now();
        else
          raise exception 'Invalid status change';
        end if;
      end if;
    elsif v_dates_changed and old.status <> 'pending' and not v_bypass then
      raise exception 'Only pending requests can be edited';
    end if;
  end if;

  if new.status in ('pending', 'approved') and v_dates_changed then
    if exists (
      select 1 from public.leave_requests r
      where r.employee_id = new.employee_id
        and r.id <> new.id
        and r.status in ('pending', 'approved')
        and daterange(r.start_date, r.end_date, '[]') && daterange(new.start_date, new.end_date, '[]')
        and not (r.half_day <> 'none' and new.half_day <> 'none' and r.half_day <> new.half_day)
    ) then
      raise exception 'There is already a leave request on these dates';
    end if;

    if v_type.default_entitlement is not null or exists (
      select 1 from public.leave_entitlements le
      where le.employee_id = new.employee_id and le.leave_type_id = new.leave_type_id
        and le.year = extract(year from new.start_date)::int
    ) then
      select coalesce(le.entitled, v_type.default_entitlement, 0)
             + coalesce(le.carried_forward, 0) + coalesce(le.adjustment, 0)
        into v_entitled
      from (select 1) x
      left join public.leave_entitlements le
        on le.employee_id = new.employee_id
       and le.leave_type_id = new.leave_type_id
       and le.year = extract(year from new.start_date)::int;

      select coalesce(sum(r.days), 0) into v_used
      from public.leave_requests r
      where r.employee_id = new.employee_id
        and r.leave_type_id = new.leave_type_id
        and r.id <> new.id
        and r.status in ('pending', 'approved')
        and extract(year from r.start_date) = extract(year from new.start_date);

      v_available := v_entitled - v_used;
      if new.days > v_available then
        raise exception 'Not enough % balance: % day(s) available', v_type.name, greatest(v_available, 0);
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger leave_requests_guard
  before insert or update on public.leave_requests
  for each row execute function private.leave_requests_guard();

-- Balances per employee, leave type and year (respects caller's RLS)
create view public.leave_balances
with (security_invoker = true)
as
select
  e.id as employee_id,
  e.company_id,
  lt.id as leave_type_id,
  lt.name as leave_type_name,
  lt.code as leave_type_code,
  lt.color,
  lt.is_paid,
  y.year,
  case
    when lt.default_entitlement is null and le.id is null then null
    else coalesce(le.entitled, lt.default_entitlement, 0) + coalesce(le.carried_forward, 0) + coalesce(le.adjustment, 0)
  end as entitled,
  coalesce((
    select sum(r.days) from public.leave_requests r
    where r.employee_id = e.id and r.leave_type_id = lt.id and r.status = 'approved'
      and extract(year from r.start_date)::int = y.year
  ), 0) as taken,
  coalesce((
    select sum(r.days) from public.leave_requests r
    where r.employee_id = e.id and r.leave_type_id = lt.id and r.status = 'pending'
      and extract(year from r.start_date)::int = y.year
  ), 0) as pending
from public.employees e
join public.leave_types lt on lt.company_id = e.company_id and lt.active
cross join lateral (
  select generate_series(extract(year from current_date)::int - 1, extract(year from current_date)::int + 1) as year
) y
left join public.leave_entitlements le
  on le.employee_id = e.id and le.leave_type_id = lt.id and le.year = y.year;

-- ---------------------------------------------------------------------------
-- Claims: limits, receipts and approval workflow
-- ---------------------------------------------------------------------------
create or replace function private.claims_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bypass boolean := private.bypass_guards();
  v_me uuid := private.my_employee_id();
  v_cat public.claim_categories;
  v_month_total numeric;
begin
  select company_id into new.company_id from public.employees where id = new.employee_id;
  if new.company_id is null then
    raise exception 'Employee not found';
  end if;

  select * into v_cat from public.claim_categories where id = new.category_id and company_id = new.company_id;
  if not found then
    raise exception 'Claim category not found';
  end if;

  if tg_op = 'INSERT' then
    if not v_bypass then
      new.status := 'pending';
      new.approver_id := null;
      new.decided_at := null;
      new.decision_note := null;
      new.pay_run_id := null;
      if not v_cat.active then
        raise exception '% is no longer accepting claims', v_cat.name;
      end if;
      if v_cat.requires_receipt and new.receipt_path is null then
        raise exception '% claims need a receipt', v_cat.name;
      end if;
      if new.expense_date > current_date then
        raise exception 'Expense date cannot be in the future';
      end if;
    end if;
  else
    if new.employee_id <> old.employee_id then
      raise exception 'A claim cannot change owner';
    end if;

    if new.status is distinct from old.status and not v_bypass then
      if new.status = 'cancelled' then
        if old.status <> 'pending' then
          raise exception 'Only pending claims can be withdrawn';
        end if;
        if not (old.employee_id = v_me or private.is_admin_of(old.company_id)) then
          raise exception 'You can only withdraw your own claims';
        end if;
      elsif new.status in ('approved', 'rejected') then
        if old.status <> 'pending' then
          raise exception 'Only pending claims can be approved or rejected';
        end if;
        if not (private.is_admin_of(old.company_id) or private.manages(old.employee_id)) then
          raise exception 'You are not allowed to decide on this claim';
        end if;
        if old.employee_id = v_me and private.my_role() is distinct from 'owner' then
          raise exception 'You cannot approve your own claim';
        end if;
        new.approver_id := v_me;
        new.decided_at := now();
      else
        raise exception 'Claims are marked paid through payroll';
      end if;
    elsif not v_bypass and old.status <> 'pending'
      and (new.amount <> old.amount or new.category_id <> old.category_id or new.expense_date <> old.expense_date) then
      raise exception 'Only pending claims can be edited';
    end if;

    if not v_bypass and new.pay_run_id is not null and new.pay_run_id is distinct from old.pay_run_id then
      raise exception 'Claims are linked to pay runs automatically';
    end if;
  end if;

  -- Monthly cap per category
  if v_cat.monthly_limit is not null and new.status in ('pending', 'approved')
     and (tg_op = 'INSERT' or new.amount <> old.amount or new.expense_date <> old.expense_date) then
    select coalesce(sum(c.amount), 0) into v_month_total
    from public.claims c
    where c.employee_id = new.employee_id
      and c.category_id = new.category_id
      and c.id <> new.id
      and c.status in ('pending', 'approved', 'paid')
      and date_trunc('month', c.expense_date) = date_trunc('month', new.expense_date);
    if v_month_total + new.amount > v_cat.monthly_limit then
      raise exception '% claims are capped at $% a month. $% is left for that month',
        v_cat.name, v_cat.monthly_limit, greatest(v_cat.monthly_limit - v_month_total, 0);
    end if;
  end if;

  return new;
end;
$$;

create trigger claims_guard
  before insert or update on public.claims
  for each row execute function private.claims_guard();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.companies enable row level security;
alter table public.departments enable row level security;
alter table public.employees enable row level security;
alter table public.employee_compensation enable row level security;
alter table public.recurring_pay_items enable row level security;
alter table public.leave_types enable row level security;
alter table public.leave_entitlements enable row level security;
alter table public.public_holidays enable row level security;
alter table public.leave_requests enable row level security;
alter table public.cpf_rates enable row level security;
alter table public.cpf_ceilings enable row level security;
alter table public.pay_runs enable row level security;
alter table public.pay_run_adjustments enable row level security;
alter table public.payslips enable row level security;
alter table public.payslip_items enable row level security;
alter table public.claim_categories enable row level security;
alter table public.claims enable row level security;

-- Companies
create policy "Members can view their company" on public.companies
  for select to authenticated using (id = (select private.my_company_id()));
create policy "Admins can update their company" on public.companies
  for update to authenticated
  using ((select private.is_admin_of(id)))
  with check ((select private.is_admin_of(id)));

-- Departments
create policy "Members can view departments" on public.departments
  for select to authenticated using (company_id = (select private.my_company_id()));
create policy "Admins can add departments" on public.departments
  for insert to authenticated with check ((select private.is_admin_of(company_id)));
create policy "Admins can update departments" on public.departments
  for update to authenticated
  using ((select private.is_admin_of(company_id)))
  with check ((select private.is_admin_of(company_id)));
create policy "Admins can delete departments" on public.departments
  for delete to authenticated using ((select private.is_admin_of(company_id)));

-- Employees (directory is visible company-wide; pay data is in employee_compensation)
create policy "Members can view the directory" on public.employees
  for select to authenticated using (company_id = (select private.my_company_id()));
create policy "Admins can add employees" on public.employees
  for insert to authenticated with check ((select private.is_admin_of(company_id)));
create policy "Admins can update employees" on public.employees
  for update to authenticated
  using ((select private.is_admin_of(company_id)))
  with check ((select private.is_admin_of(company_id)));
create policy "Admins can delete employees" on public.employees
  for delete to authenticated using ((select private.is_admin_of(company_id)) and role <> 'owner');

-- Compensation: self or admins
create policy "Self or admins can view compensation" on public.employee_compensation
  for select to authenticated
  using (employee_id = (select private.my_employee_id()) or (select private.is_admin_of(company_id)));
create policy "Admins can add compensation" on public.employee_compensation
  for insert to authenticated with check ((select private.is_admin_of(company_id)));
create policy "Admins can update compensation" on public.employee_compensation
  for update to authenticated
  using ((select private.is_admin_of(company_id)))
  with check ((select private.is_admin_of(company_id)));
create policy "Admins can delete compensation" on public.employee_compensation
  for delete to authenticated using ((select private.is_admin_of(company_id)));

-- Recurring pay items: self or admins
create policy "Self or admins can view pay items" on public.recurring_pay_items
  for select to authenticated
  using (employee_id = (select private.my_employee_id()) or (select private.is_admin_of(company_id)));
create policy "Admins can add pay items" on public.recurring_pay_items
  for insert to authenticated with check ((select private.is_admin_of(company_id)));
create policy "Admins can update pay items" on public.recurring_pay_items
  for update to authenticated
  using ((select private.is_admin_of(company_id)))
  with check ((select private.is_admin_of(company_id)));
create policy "Admins can delete pay items" on public.recurring_pay_items
  for delete to authenticated using ((select private.is_admin_of(company_id)));

-- Leave types
create policy "Members can view leave types" on public.leave_types
  for select to authenticated using (company_id = (select private.my_company_id()));
create policy "Admins can add leave types" on public.leave_types
  for insert to authenticated with check ((select private.is_admin_of(company_id)));
create policy "Admins can update leave types" on public.leave_types
  for update to authenticated
  using ((select private.is_admin_of(company_id)))
  with check ((select private.is_admin_of(company_id)));
create policy "Admins can delete leave types" on public.leave_types
  for delete to authenticated using ((select private.is_admin_of(company_id)));

-- Leave entitlements
create policy "Self, managers and admins can view entitlements" on public.leave_entitlements
  for select to authenticated using ((select private.can_see_requests_of(employee_id, company_id)));
create policy "Admins can add entitlements" on public.leave_entitlements
  for insert to authenticated with check ((select private.is_admin_of(company_id)));
create policy "Admins can update entitlements" on public.leave_entitlements
  for update to authenticated
  using ((select private.is_admin_of(company_id)))
  with check ((select private.is_admin_of(company_id)));
create policy "Admins can delete entitlements" on public.leave_entitlements
  for delete to authenticated using ((select private.is_admin_of(company_id)));

-- Public holidays
create policy "Members can view holidays" on public.public_holidays
  for select to authenticated
  using (company_id is null or company_id = (select private.my_company_id()));
create policy "Admins can add company holidays" on public.public_holidays
  for insert to authenticated with check (company_id is not null and (select private.is_admin_of(company_id)));
create policy "Admins can update company holidays" on public.public_holidays
  for update to authenticated
  using (company_id is not null and (select private.is_admin_of(company_id)))
  with check (company_id is not null and (select private.is_admin_of(company_id)));
create policy "Admins can delete company holidays" on public.public_holidays
  for delete to authenticated using (company_id is not null and (select private.is_admin_of(company_id)));

-- Leave requests
create policy "Self, managers and admins can view leave" on public.leave_requests
  for select to authenticated using ((select private.can_see_requests_of(employee_id, company_id)));
create policy "Employees apply for their own leave" on public.leave_requests
  for insert to authenticated
  with check (employee_id = (select private.my_employee_id()) or (select private.is_admin_of(company_id)));
create policy "Self, managers and admins can update leave" on public.leave_requests
  for update to authenticated
  using ((select private.can_see_requests_of(employee_id, company_id)))
  with check ((select private.can_see_requests_of(employee_id, company_id)));

-- CPF reference tables
create policy "Anyone signed in can read CPF rates" on public.cpf_rates
  for select to authenticated using (true);
create policy "Anyone signed in can read CPF ceilings" on public.cpf_ceilings
  for select to authenticated using (true);

-- Pay runs: admins see all; employees see runs that hold their published payslip
create policy "Admins and paid employees can view pay runs" on public.pay_runs
  for select to authenticated
  using (
    (select private.is_admin_of(company_id))
    or (
      status in ('approved', 'paid')
      and exists (
        select 1 from public.payslips p
        where p.pay_run_id = pay_runs.id and p.employee_id = (select private.my_employee_id())
      )
    )
  );
create policy "Admins can delete draft pay runs" on public.pay_runs
  for delete to authenticated using ((select private.is_admin_of(company_id)) and status = 'draft');

-- Adjustments: admins only, while the run is a draft
create policy "Admins can view adjustments" on public.pay_run_adjustments
  for select to authenticated using ((select private.is_admin_of(company_id)));
create policy "Admins can add adjustments to drafts" on public.pay_run_adjustments
  for insert to authenticated
  with check (
    (select private.is_admin_of(company_id))
    and exists (
      select 1 from public.pay_runs r
      where r.id = pay_run_id and r.company_id = pay_run_adjustments.company_id and r.status = 'draft'
    )
    and exists (
      select 1 from public.employees e
      where e.id = employee_id and e.company_id = pay_run_adjustments.company_id
    )
  );
create policy "Admins can delete adjustments from drafts" on public.pay_run_adjustments
  for delete to authenticated
  using (
    (select private.is_admin_of(company_id))
    and exists (select 1 from public.pay_runs r where r.id = pay_run_id and r.status = 'draft')
  );

-- Payslips: written only by payroll functions
create policy "Admins and the employee can view payslips" on public.payslips
  for select to authenticated
  using (
    (select private.is_admin_of(company_id))
    or (
      employee_id = (select private.my_employee_id())
      and private.run_published(pay_run_id)
    )
  );
create policy "Admins and the employee can view payslip lines" on public.payslip_items
  for select to authenticated
  using (
    exists (select 1 from public.payslips p where p.id = payslip_items.payslip_id)
  );

-- Claim categories
create policy "Members can view claim categories" on public.claim_categories
  for select to authenticated using (company_id = (select private.my_company_id()));
create policy "Admins can add claim categories" on public.claim_categories
  for insert to authenticated with check ((select private.is_admin_of(company_id)));
create policy "Admins can update claim categories" on public.claim_categories
  for update to authenticated
  using ((select private.is_admin_of(company_id)))
  with check ((select private.is_admin_of(company_id)));
create policy "Admins can delete claim categories" on public.claim_categories
  for delete to authenticated using ((select private.is_admin_of(company_id)));

-- Claims
create policy "Self, managers and admins can view claims" on public.claims
  for select to authenticated using ((select private.can_see_requests_of(employee_id, company_id)));
create policy "Employees submit their own claims" on public.claims
  for insert to authenticated
  with check (employee_id = (select private.my_employee_id()) or (select private.is_admin_of(company_id)));
create policy "Self, managers and admins can update claims" on public.claims
  for update to authenticated
  using ((select private.can_see_requests_of(employee_id, company_id)))
  with check ((select private.can_see_requests_of(employee_id, company_id)));

-- ---------------------------------------------------------------------------
-- Storage: private bucket for receipts and leave documents
-- Path convention: {company_id}/{employee_id}/{claims|leave}/{file}
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "Employees upload their own attachments" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'attachments'
    and (storage.foldername(name))[1] = (select private.my_company_id())::text
    and (storage.foldername(name))[2] = (select private.my_employee_id())::text
  );

create policy "Owners, managers and admins read attachments" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'attachments'
    and private.can_see_attachment(name)
  );

create policy "Employees delete their own attachments" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'attachments'
    and (storage.foldername(name))[2] = (select private.my_employee_id())::text
  );
