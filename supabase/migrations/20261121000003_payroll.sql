-- Payboy Clone: payroll engine (Singapore CPF + SDL)

-- ---------------------------------------------------------------------------
-- CPF contribution for one month
-- Follows CPF Board wage-band formulas:
--   TW <= $50          : nil
--   $50 < TW <= $500   : employer rate x TW
--   $500 < TW <= $750  : employer rate x TW + 3 x employee rate x (TW - 500)
--   TW > $750          : total rate x (capped OW + capped AW)
-- Total rounded to the nearest dollar, employee share rounded down,
-- employer share = total - employee share.
-- ---------------------------------------------------------------------------
create or replace function private.cpf_contribution(
  p_residency public.residency_status,
  p_age integer,
  p_ow numeric,
  p_aw numeric,
  p_aw_ceiling numeric,
  p_on date
)
returns table (employee_share numeric, employer_share numeric, total numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rate public.cpf_rates;
  v_ceiling public.cpf_ceilings;
  v_age integer := coalesce(p_age, 30);
  v_ow numeric := greatest(coalesce(p_ow, 0), 0);
  v_aw numeric := greatest(coalesce(p_aw, 0), 0);
  v_tw numeric;
  v_employer_rate numeric;
  v_total numeric := 0;
  v_employee numeric := 0;
begin
  employee_share := 0;
  employer_share := 0;
  total := 0;

  if p_residency = 'foreigner' then
    return next;
    return;
  end if;

  select * into v_rate
  from public.cpf_rates r
  where r.residency = p_residency
    and r.effective_from <= p_on
    and v_age > r.age_above
    and (r.age_upto is null or v_age <= r.age_upto)
  order by r.effective_from desc
  limit 1;

  if not found then
    return next;
    return;
  end if;

  select * into v_ceiling
  from public.cpf_ceilings
  where effective_from <= p_on
  order by effective_from desc
  limit 1;

  v_tw := v_ow + v_aw;
  v_employer_rate := v_rate.total_rate - v_rate.employee_rate;

  if v_tw <= 50 then
    return next;
    return;
  elsif v_tw <= 500 then
    v_total := v_employer_rate * v_tw;
    v_employee := 0;
  elsif v_tw <= 750 then
    v_employee := 3 * v_rate.employee_rate * (v_tw - 500);
    v_total := v_employer_rate * v_tw + v_employee;
  else
    v_ow := least(v_ow, v_ceiling.ow_ceiling);
    v_aw := least(v_aw, greatest(coalesce(p_aw_ceiling, v_aw), 0));
    v_total := v_rate.total_rate * (v_ow + v_aw);
    v_employee := v_rate.employee_rate * (v_ow + v_aw);
  end if;

  total := round(v_total, 0);
  employee_share := least(floor(v_employee), total);
  employer_share := total - employee_share;
  return next;
end;
$$;

-- Public calculator (handy for the CPF calculator page and for testing)
create or replace function public.calculate_cpf(
  p_residency public.residency_status,
  p_age integer,
  p_ordinary_wages numeric,
  p_additional_wages numeric default 0,
  p_on date default current_date
)
returns table (employee_share numeric, employer_share numeric, total numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select * from private.cpf_contribution(p_residency, p_age, p_ordinary_wages, p_additional_wages, null, p_on);
$$;

-- Skills Development Levy: 0.25% of total wages, min $2, max $11.25
create or replace function private.sdl_amount(p_total_wages numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_total_wages, 0) <= 0 then 0
    when p_total_wages < 800 then 2
    when p_total_wages > 4500 then 11.25
    else round(p_total_wages * 0.0025, 2)
  end;
$$;

-- ---------------------------------------------------------------------------
-- Build every payslip for a pay run from current HR data
-- ---------------------------------------------------------------------------
create or replace function private.generate_payslips(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.pay_runs;
  v_ceiling public.cpf_ceilings;
  v_emp record;
  v_item record;
  v_slip uuid;
  v_working_days numeric;
  v_days_employed numeric;
  v_from date;
  v_to date;
  v_prorated numeric;
  v_unpaid_days numeric;
  v_unpaid numeric;
  v_ow numeric;
  v_aw numeric;
  v_gross numeric;
  v_deductions numeric;
  v_reimb numeric;
  v_age integer;
  v_ytd_ow numeric;
  v_ytd_aw numeric;
  v_aw_ceiling numeric;
  v_cpf record;
  v_sort integer;
  v_months_left integer;
begin
  perform set_config('app.bypass_guards', 'on', true);

  select * into v_run from public.pay_runs where id = p_run_id for update;
  if not found then
    raise exception 'Pay run not found';
  end if;

  update public.claims set pay_run_id = null where pay_run_id = p_run_id and status = 'approved';
  delete from public.payslips where pay_run_id = p_run_id;

  select * into v_ceiling from public.cpf_ceilings
  where effective_from <= v_run.period_end order by effective_from desc limit 1;

  v_working_days := private.business_days(v_run.company_id, v_run.period_start, v_run.period_end);
  v_months_left := 13 - extract(month from v_run.period_start)::int;

  for v_emp in
    select e.*, coalesce(c.basic_salary, 0) as basic
    from public.employees e
    left join public.employee_compensation c on c.employee_id = e.id
    where e.company_id = v_run.company_id
      and e.hire_date <= v_run.period_end
      and (e.termination_date is null or e.termination_date >= v_run.period_start)
      and (e.status = 'active' or e.termination_date is not null)
    order by e.full_name
  loop
    v_from := greatest(v_run.period_start, v_emp.hire_date);
    v_to := least(v_run.period_end, coalesce(v_emp.termination_date, v_run.period_end));
    v_days_employed := private.business_days(v_run.company_id, v_from, v_to);

    if v_from = v_run.period_start and v_to = v_run.period_end then
      v_prorated := v_emp.basic;
    elsif v_working_days = 0 then
      v_prorated := 0;
    else
      v_prorated := round(v_emp.basic * v_days_employed / v_working_days, 2);
    end if;

    -- Approved unpaid leave inside the employed window
    select coalesce(sum(
             case when lr.half_day <> 'none'
                  then least(private.business_days(v_run.company_id, greatest(lr.start_date, v_from), least(lr.end_date, v_to)), 0.5)
                  else private.business_days(v_run.company_id, greatest(lr.start_date, v_from), least(lr.end_date, v_to))
             end), 0)
      into v_unpaid_days
    from public.leave_requests lr
    join public.leave_types lt on lt.id = lr.leave_type_id
    where lr.employee_id = v_emp.id
      and lr.status = 'approved'
      and not lt.is_paid
      and lr.start_date <= v_to
      and lr.end_date >= v_from;

    v_unpaid := case when v_working_days = 0 then 0
                     else least(round(v_emp.basic / v_working_days * v_unpaid_days, 2), v_prorated) end;

    insert into public.payslips (pay_run_id, company_id, employee_id, basic_salary, prorated_basic,
                                 working_days, days_employed, unpaid_leave_days, unpaid_leave_deduction, residency)
    values (p_run_id, v_run.company_id, v_emp.id, v_emp.basic, v_prorated,
            v_working_days, v_days_employed, v_unpaid_days, v_unpaid, v_emp.residency)
    returning id into v_slip;

    v_sort := 0;
    insert into public.payslip_items (payslip_id, company_id, label, kind, amount, cpf_type, source, sort_order)
    values (v_slip, v_run.company_id,
            case when v_prorated <> v_emp.basic
                 then format('Basic salary (%s of %s working days)', v_days_employed, v_working_days)
                 else 'Basic salary' end,
            'earning', v_prorated, 'ow', 'basic', v_sort);

    if v_unpaid > 0 then
      v_sort := v_sort + 1;
      insert into public.payslip_items (payslip_id, company_id, label, kind, amount, cpf_type, source, sort_order)
      values (v_slip, v_run.company_id, format('Unpaid leave (%s day%s)', v_unpaid_days, case when v_unpaid_days = 1 then '' else 's' end),
              'earning', -v_unpaid, 'ow', 'unpaid_leave', v_sort);
    end if;

    for v_item in
      select * from public.recurring_pay_items
      where employee_id = v_emp.id and active and amount > 0
      order by kind, name
    loop
      v_sort := v_sort + 1;
      insert into public.payslip_items (payslip_id, company_id, label, kind, amount, cpf_type, source, source_id, sort_order)
      values (v_slip, v_run.company_id, v_item.name, v_item.kind::text, v_item.amount,
              case when v_item.kind = 'earning' and v_item.cpf_applicable then 'ow'::public.cpf_wage_type else 'none'::public.cpf_wage_type end,
              'recurring', v_item.id, v_sort);
    end loop;

    for v_item in
      select * from public.pay_run_adjustments
      where pay_run_id = p_run_id and employee_id = v_emp.id
      order by created_at
    loop
      v_sort := v_sort + 1;
      insert into public.payslip_items (payslip_id, company_id, label, kind, amount, cpf_type, source, source_id, sort_order)
      values (v_slip, v_run.company_id, v_item.label, v_item.kind::text, v_item.amount,
              case when v_item.kind = 'earning' then v_item.cpf_type else 'none'::public.cpf_wage_type end,
              'adjustment', v_item.id, v_sort);
    end loop;

    for v_item in
      select c.id, c.amount, c.expense_date, cc.name as category
      from public.claims c
      join public.claim_categories cc on cc.id = c.category_id
      where c.employee_id = v_emp.id
        and c.status = 'approved'
        and c.pay_run_id is null
        and c.expense_date <= v_run.period_end
      order by c.expense_date
    loop
      v_sort := v_sort + 1;
      insert into public.payslip_items (payslip_id, company_id, label, kind, amount, cpf_type, source, source_id, sort_order)
      values (v_slip, v_run.company_id, format('%s claim (%s)', v_item.category, to_char(v_item.expense_date, 'DD Mon')),
              'reimbursement', v_item.amount, 'none', 'claim', v_item.id, v_sort);
      update public.claims set pay_run_id = p_run_id where id = v_item.id;
    end loop;

    select
      coalesce(sum(amount) filter (where kind = 'earning' and cpf_type = 'ow'), 0),
      coalesce(sum(amount) filter (where kind = 'earning' and cpf_type = 'aw'), 0),
      coalesce(sum(amount) filter (where kind = 'earning'), 0),
      coalesce(sum(amount) filter (where kind = 'deduction'), 0),
      coalesce(sum(amount) filter (where kind = 'reimbursement'), 0)
    into v_ow, v_aw, v_gross, v_deductions, v_reimb
    from public.payslip_items where payslip_id = v_slip;

    v_ow := greatest(v_ow, 0);

    -- CPF age group changes the month after the birthday month
    v_age := case when v_emp.date_of_birth is null then null
                  else extract(year from age(v_run.period_start - 1, v_emp.date_of_birth))::int end;

    -- Additional Wage ceiling = annual salary ceiling - OW subject to CPF for the year
    select coalesce(sum(least(ps.ordinary_wages, v_ceiling.ow_ceiling)), 0), coalesce(sum(ps.additional_wages), 0)
      into v_ytd_ow, v_ytd_aw
    from public.payslips ps
    join public.pay_runs pr on pr.id = ps.pay_run_id
    where ps.employee_id = v_emp.id
      and pr.company_id = v_run.company_id
      and pr.period_start < v_run.period_start
      and extract(year from pr.period_start) = extract(year from v_run.period_start);

    v_aw_ceiling := greatest(
      v_ceiling.annual_ceiling - v_ytd_ow - least(v_ow, v_ceiling.ow_ceiling) * v_months_left - v_ytd_aw,
      0);

    select * into v_cpf
    from private.cpf_contribution(v_emp.residency, v_age, v_ow, v_aw, v_aw_ceiling, v_run.period_start);

    update public.payslips set
      ordinary_wages = v_ow,
      additional_wages = v_aw,
      gross_pay = v_gross,
      total_deductions = v_deductions,
      reimbursements = v_reimb,
      employee_cpf = v_cpf.employee_share,
      employer_cpf = v_cpf.employer_share,
      sdl = private.sdl_amount(v_gross),
      net_pay = v_gross - v_cpf.employee_share - v_deductions + v_reimb,
      cpf_age = v_age
    where id = v_slip;
  end loop;

  update public.pay_runs r set
    employee_count = s.n,
    total_gross = s.gross,
    total_deductions = s.ded,
    total_reimbursements = s.reimb,
    total_employee_cpf = s.ee,
    total_employer_cpf = s.er,
    total_sdl = s.sdl,
    total_net = s.net
  from (
    select count(*) as n,
           coalesce(sum(gross_pay), 0) as gross,
           coalesce(sum(total_deductions), 0) as ded,
           coalesce(sum(reimbursements), 0) as reimb,
           coalesce(sum(employee_cpf), 0) as ee,
           coalesce(sum(employer_cpf), 0) as er,
           coalesce(sum(sdl), 0) as sdl,
           coalesce(sum(net_pay), 0) as net
    from public.payslips where pay_run_id = p_run_id
  ) s
  where r.id = p_run_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public payroll RPCs (admins only)
-- ---------------------------------------------------------------------------
create or replace function public.create_pay_run(p_month date)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company public.companies;
  v_start date := date_trunc('month', p_month)::date;
  v_end date := (date_trunc('month', p_month) + interval '1 month - 1 day')::date;
  v_id uuid;
begin
  select * into v_company from public.companies where id = private.my_company_id();
  if not found or not private.is_admin_of(v_company.id) then
    raise exception 'Only admins can run payroll';
  end if;

  if exists (select 1 from public.pay_runs where company_id = v_company.id and period_start = v_start) then
    raise exception 'A pay run for % already exists', to_char(v_start, 'FMMonth YYYY');
  end if;

  insert into public.pay_runs (company_id, period_start, period_end, pay_date, created_by)
  values (v_company.id, v_start, v_end,
          make_date(extract(year from v_start)::int, extract(month from v_start)::int,
                    least(v_company.payday::int, extract(day from v_end)::int)),
          private.my_employee_id())
  returning id into v_id;

  perform private.generate_payslips(v_id);
  return v_id;
end;
$$;

create or replace function public.recalculate_pay_run(p_run_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.pay_runs;
begin
  select * into v_run from public.pay_runs where id = p_run_id;
  if not found or not private.is_admin_of(v_run.company_id) then
    raise exception 'Pay run not found';
  end if;
  if v_run.status <> 'draft' then
    raise exception 'Only draft pay runs can be recalculated. Move it back to draft first';
  end if;
  perform private.generate_payslips(p_run_id);
end;
$$;

create or replace function public.set_pay_run_status(p_run_id uuid, p_status public.pay_run_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.pay_runs;
begin
  select * into v_run from public.pay_runs where id = p_run_id for update;
  if not found or not private.is_admin_of(v_run.company_id) then
    raise exception 'Pay run not found';
  end if;

  perform set_config('app.bypass_guards', 'on', true);

  if v_run.status = 'draft' and p_status = 'approved' then
    if v_run.employee_count = 0 then
      raise exception 'This pay run has no payslips';
    end if;
    update public.pay_runs set status = 'approved', approved_at = now() where id = p_run_id;
  elsif v_run.status = 'approved' and p_status = 'draft' then
    update public.pay_runs set status = 'draft', approved_at = null where id = p_run_id;
  elsif v_run.status = 'approved' and p_status = 'paid' then
    update public.pay_runs set status = 'paid', paid_at = now() where id = p_run_id;
    update public.claims set status = 'paid' where pay_run_id = p_run_id and status = 'approved';
  else
    raise exception 'Cannot move a % pay run to %', v_run.status, p_status;
  end if;
end;
$$;

revoke execute on function public.create_pay_run(date) from anon, public;
revoke execute on function public.recalculate_pay_run(uuid) from anon, public;
revoke execute on function public.set_pay_run_status(uuid, public.pay_run_status) from anon, public;
revoke execute on function public.calculate_cpf(public.residency_status, integer, numeric, numeric, date) from anon, public;
grant execute on function public.create_pay_run(date) to authenticated;
grant execute on function public.recalculate_pay_run(uuid) to authenticated;
grant execute on function public.set_pay_run_status(uuid, public.pay_run_status) to authenticated;
grant execute on function public.calculate_cpf(public.residency_status, integer, numeric, numeric, date) to authenticated;
grant execute on all functions in schema private to authenticated;

revoke execute on function private.generate_payslips(uuid) from authenticated, public;
