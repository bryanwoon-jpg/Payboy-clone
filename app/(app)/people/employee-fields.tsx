import { Field } from "@/components/ui";
import { employmentLabels, residencyLabels, roleLabels, todayISO } from "@/lib/format";
import type { AppRole, Department, Employee } from "@/lib/types";

export function EmployeeFields({
  employee,
  departments,
  managers,
  canGrantAdmin,
}: {
  employee?: Partial<Employee>;
  departments: Department[];
  managers: Pick<Employee, "id" | "full_name">[];
  canGrantAdmin: boolean;
}) {
  const roles: AppRole[] = canGrantAdmin ? ["employee", "manager", "admin", "owner"] : ["employee", "manager"];
  const lockedRole = !canGrantAdmin && (employee?.role === "admin" || employee?.role === "owner");

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Full name" htmlFor="full_name">
        <input id="full_name" name="full_name" required defaultValue={employee?.full_name ?? ""} className="input" />
      </Field>
      <Field label="Work email" htmlFor="email" hint="They sign up with this email to get access.">
        <input id="email" name="email" type="email" required defaultValue={employee?.email ?? ""} className="input" />
      </Field>
      <Field label="Job title" htmlFor="job_title">
        <input id="job_title" name="job_title" defaultValue={employee?.job_title ?? ""} className="input" />
      </Field>
      <Field label="Employee ID" htmlFor="employee_code">
        <input id="employee_code" name="employee_code" defaultValue={employee?.employee_code ?? ""} className="input" />
      </Field>
      <Field label="Department" htmlFor="department_id">
        <select id="department_id" name="department_id" defaultValue={employee?.department_id ?? ""} className="input">
          <option value="">None</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Reports to" htmlFor="manager_id" hint="This person approves their leave and claims.">
        <select id="manager_id" name="manager_id" defaultValue={employee?.manager_id ?? ""} className="input">
          <option value="">No manager</option>
          {managers
            .filter((m) => m.id !== employee?.id)
            .map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Access" htmlFor="role" hint={lockedRole ? "Only the owner can change this." : undefined}>
        {lockedRole ? (
          <>
            <input type="hidden" name="role" value={employee?.role} />
            <input disabled value={roleLabels[employee!.role!]} className="input" />
          </>
        ) : (
          <select id="role" name="role" defaultValue={employee?.role ?? "employee"} className="input">
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label="Employment type" htmlFor="employment_type">
        <select id="employment_type" name="employment_type" defaultValue={employee?.employment_type ?? "full_time"} className="input">
          {Object.entries(employmentLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Residency" htmlFor="residency" hint="Decides which CPF rates apply.">
        <select id="residency" name="residency" defaultValue={employee?.residency ?? "citizen"} className="input">
          {Object.entries(residencyLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Date of birth" htmlFor="date_of_birth" hint="Used for CPF age bands.">
        <input id="date_of_birth" name="date_of_birth" type="date" defaultValue={employee?.date_of_birth ?? ""} className="input" />
      </Field>
      <Field label="Start date" htmlFor="hire_date">
        <input id="hire_date" name="hire_date" type="date" required defaultValue={employee?.hire_date ?? todayISO()} className="input" />
      </Field>
      <Field label="Mobile" htmlFor="phone">
        <input id="phone" name="phone" type="tel" defaultValue={employee?.phone ?? ""} className="input" placeholder="+65" />
      </Field>
    </div>
  );
}

export function BankFields({
  values,
}: {
  values?: { basic_salary?: number; bank_name?: string | null; bank_account_name?: string | null; bank_account_no?: string | null };
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Monthly basic salary (SGD)" htmlFor="basic_salary" className="sm:col-span-2">
        <input
          id="basic_salary"
          name="basic_salary"
          type="number"
          min="0"
          step="0.01"
          required
          defaultValue={values?.basic_salary ?? ""}
          className="input max-w-xs"
        />
      </Field>
      <Field label="Bank" htmlFor="bank_name">
        <input id="bank_name" name="bank_name" defaultValue={values?.bank_name ?? ""} className="input" placeholder="DBS, OCBC, UOB…" />
      </Field>
      <Field label="Account holder name" htmlFor="bank_account_name">
        <input id="bank_account_name" name="bank_account_name" defaultValue={values?.bank_account_name ?? ""} className="input" />
      </Field>
      <Field label="Account number" htmlFor="bank_account_no">
        <input id="bank_account_no" name="bank_account_no" defaultValue={values?.bank_account_no ?? ""} className="input" />
      </Field>
    </div>
  );
}
