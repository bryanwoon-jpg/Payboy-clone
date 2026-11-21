export type AppRole = "owner" | "admin" | "manager" | "employee";
export type ResidencyStatus = "citizen" | "pr" | "pr_1" | "pr_2" | "foreigner";
export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";
export type ClaimStatus = RequestStatus | "paid";
export type PayRunStatus = "draft" | "approved" | "paid";
export type HalfDay = "none" | "am" | "pm";
export type CpfWageType = "ow" | "aw" | "none";

export interface Company {
  id: string;
  name: string;
  uen: string | null;
  address: string | null;
  industry: string | null;
  currency: string;
  payday: number;
  work_days: number[];
}

export interface Employee {
  id: string;
  company_id: string;
  user_id: string | null;
  employee_code: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  department_id: string | null;
  manager_id: string | null;
  role: AppRole;
  employment_type: EmploymentType;
  residency: ResidencyStatus;
  date_of_birth: string | null;
  hire_date: string;
  termination_date: string | null;
  status: "active" | "terminated";
}

export interface Department {
  id: string;
  name: string;
}

export interface LeaveType {
  id: string;
  name: string;
  code: string;
  color: string;
  default_entitlement: number | null;
  is_paid: boolean;
  requires_attachment: boolean;
  allow_half_day: boolean;
  carry_forward_limit: number;
  active: boolean;
}

export interface LeaveBalance {
  employee_id: string;
  leave_type_id: string;
  leave_type_name: string;
  leave_type_code: string;
  color: string;
  is_paid: boolean;
  year: number;
  entitled: number | null;
  taken: number;
  pending: number;
}

export interface LeaveRequest {
  id: string;
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  half_day: HalfDay;
  days: number;
  reason: string | null;
  attachment_path: string | null;
  status: RequestStatus;
  approver_id: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
}

export interface ClaimCategory {
  id: string;
  name: string;
  monthly_limit: number | null;
  requires_receipt: boolean;
  active: boolean;
}

export interface Claim {
  id: string;
  employee_id: string;
  category_id: string;
  expense_date: string;
  merchant: string | null;
  description: string | null;
  amount: number;
  receipt_path: string | null;
  status: ClaimStatus;
  decision_note: string | null;
  pay_run_id: string | null;
  created_at: string;
}

export interface PayRun {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: PayRunStatus;
  employee_count: number;
  total_gross: number;
  total_deductions: number;
  total_reimbursements: number;
  total_employee_cpf: number;
  total_employer_cpf: number;
  total_sdl: number;
  total_net: number;
  approved_at: string | null;
  paid_at: string | null;
}

export interface Payslip {
  id: string;
  pay_run_id: string;
  employee_id: string;
  basic_salary: number;
  prorated_basic: number;
  working_days: number;
  days_employed: number;
  unpaid_leave_days: number;
  unpaid_leave_deduction: number;
  ordinary_wages: number;
  additional_wages: number;
  gross_pay: number;
  total_deductions: number;
  reimbursements: number;
  employee_cpf: number;
  employer_cpf: number;
  sdl: number;
  net_pay: number;
  cpf_age: number | null;
  residency: ResidencyStatus | null;
}

export interface PayslipItem {
  id: string;
  label: string;
  kind: "earning" | "deduction" | "reimbursement";
  amount: number;
  cpf_type: CpfWageType;
  source: string;
  sort_order: number;
}

export type ActionState = { error?: string; message?: string } | undefined;
