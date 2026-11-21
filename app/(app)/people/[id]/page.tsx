import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Avatar, Field, Money, PageHeader, Section, StatusBadge } from "@/components/ui";
import { formatDate, residencyLabels, roleLabels, todayISO } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Department, Employee, LeaveType } from "@/lib/types";
import {
  addPayItem,
  removePayItem,
  saveEntitlements,
  setTermination,
  updateCompensation,
  updateEmployee,
} from "../actions";
import { BankFields, EmployeeFields } from "../employee-fields";

export const metadata = { title: "Employee" };

type PayItem = { id: string; name: string; kind: "earning" | "deduction"; amount: number; cpf_applicable: boolean };
type Entitlement = { leave_type_id: string; entitled: number; carried_forward: number; adjustment: number };

export default async function EmployeePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const session = await requireAdmin();
  const { id } = await params;
  const { created } = await searchParams;
  const supabase = await createClient();
  const year = Number(todayISO().slice(0, 4));

  const { data: employeeData } = await supabase.from("employees").select("*").eq("id", id).maybeSingle();
  if (!employeeData) notFound();
  const employee = employeeData as Employee;

  const [{ data: departments }, { data: managers }, { data: comp }, { data: items }, { data: types }, { data: ents }] =
    await Promise.all([
      supabase.from("departments").select("id, name").order("name"),
      supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name"),
      supabase.from("employee_compensation").select("*").eq("employee_id", id).maybeSingle(),
      supabase.from("recurring_pay_items").select("*").eq("employee_id", id).order("kind").order("name"),
      supabase.from("leave_types").select("*").eq("active", true).order("name"),
      supabase.from("leave_entitlements").select("*").eq("employee_id", id).eq("year", year),
    ]);

  const payItems = (items ?? []) as PayItem[];
  const leaveTypes = (types ?? []) as LeaveType[];
  const entitlements = new Map(((ents ?? []) as Entitlement[]).map((e) => [e.leave_type_id, e]));
  const isOwner = session.employee.role === "owner";

  return (
    <>
      <div className="mb-2">
        <Link href="/people" className="text-sm font-semibold text-muted hover:text-ink">
          People
        </Link>
      </div>
      <PageHeader
        title={employee.full_name}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {employee.job_title ?? "No title"}, {roleLabels[employee.role]}, {residencyLabels[employee.residency]}
            {employee.status === "terminated" ? <StatusBadge status="terminated" /> : null}
          </span>
        }
        actions={<Avatar name={employee.full_name} size="lg" />}
      />

      {created ? (
        <p className="mb-6 rounded-[6px] bg-approved-tint px-4 py-3 text-sm text-approved">
          {employee.full_name} has been added. Ask them to sign up at this site with {employee.email}.
        </p>
      ) : !employee.user_id ? (
        <p className="mb-6 rounded-[6px] bg-pending-tint px-4 py-3 text-sm text-pending">
          {employee.full_name} has not signed up yet. They get access by creating an account with {employee.email}.
        </p>
      ) : null}

      <div className="space-y-6">
        <Section title="Profile">
          <ActionForm action={updateEmployee}>
            <input type="hidden" name="id" value={employee.id} />
            <EmployeeFields
              employee={employee}
              departments={(departments ?? []) as Department[]}
              managers={managers ?? []}
              canGrantAdmin={isOwner}
            />
            <div className="mt-5 flex justify-end">
              <SubmitButton>Save profile</SubmitButton>
            </div>
          </ActionForm>
        </Section>

        <Section title="Pay" description="Basic salary is prorated automatically for joiners, leavers and unpaid leave.">
          <ActionForm action={updateCompensation}>
            <input type="hidden" name="id" value={employee.id} />
            <BankFields values={comp ?? undefined} />
            <div className="mt-5 flex justify-end">
              <SubmitButton>Save pay details</SubmitButton>
            </div>
          </ActionForm>
        </Section>

        <Section
          title="Monthly allowances and deductions"
          description="Added to every payslip until removed. Use pay run adjustments for one-off amounts like bonuses."
          flush
        >
          {payItems.length ? (
            <table className="table">
              <tbody>
                {payItems.map((item) => (
                  <tr key={item.id}>
                    <td className="font-semibold">{item.name}</td>
                    <td>
                      {item.kind === "earning"
                        ? item.cpf_applicable
                          ? "Allowance, counts for CPF"
                          : "Allowance, no CPF"
                        : "Deduction after CPF"}
                    </td>
                    <td className="num">
                      {item.kind === "deduction" ? "−" : ""}
                      <Money value={item.amount} />
                    </td>
                    <td className="num">
                      <form action={removePayItem}>
                        <input type="hidden" name="id" value={employee.id} />
                        <input type="hidden" name="item_id" value={item.id} />
                        <button type="submit" className="btn btn-secondary btn-sm">
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="px-5 pt-5 text-sm text-muted">No recurring items.</p>
          )}
          <ActionForm action={addPayItem} resetOnSuccess className="border-t border-rule p-5">
            <input type="hidden" name="id" value={employee.id} />
            <div className="grid items-end gap-3 sm:grid-cols-[2fr_1.3fr_1fr_auto]">
              <Field label="Name" htmlFor="pi_name">
                <input id="pi_name" name="name" required className="input" placeholder="Transport allowance" />
              </Field>
              <Field label="Type" htmlFor="pi_kind">
                <select id="pi_kind" name="kind" className="input">
                  <option value="earning">Allowance</option>
                  <option value="deduction">Deduction</option>
                </select>
              </Field>
              <Field label="Amount" htmlFor="pi_amount">
                <input id="pi_amount" name="amount" type="number" min="0.01" step="0.01" required className="input" />
              </Field>
              <SubmitButton className="btn btn-secondary">Add</SubmitButton>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" name="cpf_applicable" defaultChecked className="h-4 w-4 accent-ledger" />
              Allowance counts as ordinary wages for CPF
            </label>
          </ActionForm>
        </Section>

        <Section
          title={`Leave entitlements, ${year}`}
          description="Blank rows use the company default for that leave type."
          flush
        >
          <ActionForm action={saveEntitlements}>
            <input type="hidden" name="id" value={employee.id} />
            <input type="hidden" name="year" value={year} />
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Leave type</th>
                    <th className="num">Entitled</th>
                    <th className="num">Carried forward</th>
                    <th className="num">Adjustment</th>
                  </tr>
                </thead>
                <tbody>
                  {leaveTypes
                    .filter((t) => t.default_entitlement !== null || entitlements.has(t.id))
                    .map((t) => {
                      const e = entitlements.get(t.id);
                      return (
                        <tr key={t.id}>
                          <td>
                            <input type="hidden" name="leave_type_id" value={t.id} />
                            {t.name}
                          </td>
                          <td className="num">
                            <input
                              name={`entitled_${t.id}`}
                              type="number"
                              step="0.5"
                              min="0"
                              defaultValue={e?.entitled ?? t.default_entitlement ?? 0}
                              className="input w-24 text-right"
                              aria-label={`${t.name} entitled days`}
                            />
                          </td>
                          <td className="num">
                            <input
                              name={`carried_${t.id}`}
                              type="number"
                              step="0.5"
                              min="0"
                              defaultValue={e?.carried_forward ?? 0}
                              className="input w-24 text-right"
                              aria-label={`${t.name} carried forward days`}
                            />
                          </td>
                          <td className="num">
                            <input
                              name={`adjustment_${t.id}`}
                              type="number"
                              step="0.5"
                              defaultValue={e?.adjustment ?? 0}
                              className="input w-24 text-right"
                              aria-label={`${t.name} adjustment days`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end border-t border-rule p-5">
              <SubmitButton>Save entitlements</SubmitButton>
            </div>
          </ActionForm>
        </Section>

        {employee.role !== "owner" ? (
          <Section title="Offboarding" description="Set a last day to prorate their final pay and remove access after it.">
            <ActionForm action={setTermination} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={employee.id} />
              <Field label="Last day of work" htmlFor="termination_date">
                <input
                  id="termination_date"
                  name="termination_date"
                  type="date"
                  min={employee.hire_date}
                  defaultValue={employee.termination_date ?? ""}
                  className="input"
                />
              </Field>
              <SubmitButton className="btn btn-danger">Save last day</SubmitButton>
              {employee.termination_date ? (
                <p className="w-full text-sm text-muted">
                  Leaving on {formatDate(employee.termination_date)}. Clear the date and save to undo.
                </p>
              ) : null}
            </ActionForm>
          </Section>
        ) : null}
      </div>
    </>
  );
}
