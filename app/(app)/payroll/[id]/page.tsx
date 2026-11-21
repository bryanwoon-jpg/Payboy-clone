import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Money, PageHeader, Section, StatusBadge } from "@/components/ui";
import { formatDate, formatMonth } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { PayRun, Payslip } from "@/lib/types";
import { addAdjustment, changePayRunStatus, deletePayRun, recalculatePayRun, removeAdjustment } from "../actions";

export const metadata = { title: "Pay run" };

type SlipRow = Payslip & { employee: { full_name: string; job_title: string | null; residency: string } };
type Adjustment = { id: string; employee_id: string; label: string; kind: string; amount: number; cpf_type: string };

const steps = [
  { key: "draft", label: "Review", text: "Check payslips, add bonuses or one-off deductions." },
  { key: "approved", label: "Approve", text: "Payslips become visible to employees." },
  { key: "paid", label: "Pay", text: "Upload the bank file, then mark the run as paid." },
] as const;

export default async function PayRunPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  const supabase = await createClient();

  const { data: runData } = await supabase.from("pay_runs").select("*").eq("id", id).maybeSingle();
  if (!runData) notFound();
  const run = runData as PayRun;

  const [{ data: slipData }, { data: adjData }, { data: people }] = await Promise.all([
    supabase
      .from("payslips")
      .select("*, employee:employees(full_name, job_title, residency)")
      .eq("pay_run_id", id),
    supabase.from("pay_run_adjustments").select("*").eq("pay_run_id", id).order("created_at"),
    supabase.from("employees").select("id, full_name").order("full_name"),
  ]);
  const slips = ((slipData ?? []) as SlipRow[]).sort((a, b) => a.employee.full_name.localeCompare(b.employee.full_name));
  const adjustments = (adjData ?? []) as Adjustment[];
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const slipEmployees = slips.map((s) => ({ id: s.employee_id, name: s.employee.full_name }));
  const isDraft = run.status === "draft";
  const stepIndex = steps.findIndex((s) => s.key === run.status);
  const companyCost =
    Number(run.total_gross) + Number(run.total_employer_cpf) + Number(run.total_sdl) + Number(run.total_reimbursements);

  return (
    <>
      <div className="mb-2">
        <Link href="/payroll" className="text-sm font-semibold text-muted hover:text-ink">
          Payroll
        </Link>
      </div>
      <PageHeader
        title={`${formatMonth(run.period_start)} pay run`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {formatDate(run.period_start)} to {formatDate(run.period_end)}, paid {formatDate(run.pay_date)}
            <StatusBadge status={run.status} />
          </span>
        }
        actions={
          <>
            <a href={`/payroll/${run.id}/export?type=bank`} className="btn btn-secondary">
              Bank file (CSV)
            </a>
            <a href={`/payroll/${run.id}/export?type=cpf`} className="btn btn-secondary">
              CPF summary (CSV)
            </a>
          </>
        }
      />

      <ol className="mb-6 grid gap-px overflow-hidden rounded-[10px] border border-rule bg-rule sm:grid-cols-3">
        {steps.map((step, i) => {
          const done = i < stepIndex || run.status === "paid";
          const current = i === stepIndex && run.status !== "paid";
          return (
            <li key={step.key} className={`px-5 py-4 ${current ? "bg-ledger-tint" : "bg-surface"}`}>
              <p className={`text-sm font-bold ${current ? "text-ledger" : done ? "text-approved" : "text-faint"}`}>
                {i + 1}. {step.label}
                {done ? " (done)" : ""}
              </p>
              <p className="mt-0.5 text-sm text-muted">{step.text}</p>
            </li>
          );
        })}
      </ol>

      <Section className="mb-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <dl className="grid flex-1 grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            <div>
              <dt className="text-sm text-muted">Net pay to bank</dt>
              <dd className="mt-0.5 text-2xl font-bold text-ink">
                <Money value={run.total_net} />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Gross wages</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                <Money value={run.total_gross} />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">CPF to submit</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                <Money value={Number(run.total_employee_cpf) + Number(run.total_employer_cpf)} />
              </dd>
              <dd className="text-xs text-muted">
                <Money value={run.total_employee_cpf} /> employee, <Money value={run.total_employer_cpf} /> employer
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">SDL</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                <Money value={run.total_sdl} />
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted">Total cost to company</dt>
              <dd className="mt-0.5 text-lg font-semibold">
                <Money value={companyCost} />
              </dd>
              <dd className="text-xs text-muted">Includes claims of <Money value={run.total_reimbursements} /></dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            {isDraft ? (
              <>
                <ActionForm action={recalculatePayRun}>
                  <input type="hidden" name="id" value={run.id} />
                  <SubmitButton className="btn btn-secondary" pendingText="Recalculating…">
                    Recalculate
                  </SubmitButton>
                </ActionForm>
                <ActionForm action={changePayRunStatus}>
                  <input type="hidden" name="id" value={run.id} />
                  <input type="hidden" name="status" value="approved" />
                  <SubmitButton pendingText="Approving…">Approve pay run</SubmitButton>
                </ActionForm>
              </>
            ) : null}
            {run.status === "approved" ? (
              <>
                <ActionForm action={changePayRunStatus}>
                  <input type="hidden" name="id" value={run.id} />
                  <input type="hidden" name="status" value="draft" />
                  <SubmitButton className="btn btn-secondary" pendingText="Reopening…">
                    Back to draft
                  </SubmitButton>
                </ActionForm>
                <ActionForm action={changePayRunStatus}>
                  <input type="hidden" name="id" value={run.id} />
                  <input type="hidden" name="status" value="paid" />
                  <SubmitButton className="btn btn-approve" pendingText="Saving…">
                    Mark as paid
                  </SubmitButton>
                </ActionForm>
              </>
            ) : null}
          </div>
        </div>
      </Section>

      <Section title="Payslips" description={`${slips.length} employees in this run`} flush className="mb-6">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th className="num">Gross</th>
                <th className="num">Deductions</th>
                <th className="num">Employee CPF</th>
                <th className="num">Claims</th>
                <th className="num">Net pay</th>
                <th className="num">Employer CPF</th>
                <th className="num">SDL</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/payslips/${s.id}`} className="link">
                      {s.employee.full_name}
                    </Link>
                    <p className="text-xs text-muted">
                      {Number(s.days_employed) < Number(s.working_days)
                        ? `Prorated, ${Number(s.days_employed)} of ${Number(s.working_days)} days`
                        : s.employee.job_title}
                      {Number(s.unpaid_leave_days) > 0 ? `, ${Number(s.unpaid_leave_days)} unpaid leave` : ""}
                    </p>
                  </td>
                  <td className="num">
                    <Money value={s.gross_pay} />
                  </td>
                  <td className="num">{Number(s.total_deductions) ? <Money value={-s.total_deductions} /> : ""}</td>
                  <td className="num">{Number(s.employee_cpf) ? <Money value={-s.employee_cpf} /> : <span className="text-faint">None</span>}</td>
                  <td className="num">{Number(s.reimbursements) ? <Money value={s.reimbursements} /> : ""}</td>
                  <td className="num font-semibold">
                    <Money value={s.net_pay} />
                  </td>
                  <td className="num text-muted">
                    <Money value={s.employer_cpf} />
                  </td>
                  <td className="num text-muted">
                    <Money value={s.sdl} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-rule font-semibold">
                <td className="px-4 py-3">Total</td>
                <td className="num px-4 py-3">
                  <Money value={run.total_gross} />
                </td>
                <td className="num px-4 py-3">
                  <Money value={-run.total_deductions} />
                </td>
                <td className="num px-4 py-3">
                  <Money value={-run.total_employee_cpf} />
                </td>
                <td className="num px-4 py-3">
                  <Money value={run.total_reimbursements} />
                </td>
                <td className="num px-4 py-3">
                  <Money value={run.total_net} />
                </td>
                <td className="num px-4 py-3">
                  <Money value={run.total_employer_cpf} />
                </td>
                <td className="num px-4 py-3">
                  <Money value={run.total_sdl} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      <Section
        title="One-off adjustments"
        description="Bonuses, overtime, commission or one-off deductions for this month only."
        flush
      >
        {adjustments.length ? (
          <table className="table">
            <tbody>
              {adjustments.map((a) => (
                <tr key={a.id}>
                  <td className="font-semibold">{names.get(a.employee_id)}</td>
                  <td>{a.label}</td>
                  <td>
                    {a.kind === "deduction"
                      ? "Deduction after CPF"
                      : a.cpf_type === "aw"
                        ? "Additional wage (CPF)"
                        : a.cpf_type === "ow"
                          ? "Ordinary wage (CPF)"
                          : "No CPF"}
                  </td>
                  <td className="num">
                    <Money value={a.kind === "deduction" ? -a.amount : a.amount} />
                  </td>
                  <td className="num">
                    {isDraft ? (
                      <form action={removeAdjustment}>
                        <input type="hidden" name="id" value={run.id} />
                        <input type="hidden" name="adjustment_id" value={a.id} />
                        <button type="submit" className="btn btn-secondary btn-sm">
                          Remove
                        </button>
                      </form>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="px-5 pt-5 text-sm text-muted">No adjustments.</p>
        )}
        {isDraft ? (
          <ActionForm action={addAdjustment} resetOnSuccess className="border-t border-rule p-5">
            <input type="hidden" name="id" value={run.id} />
            <div className="grid items-end gap-3 md:grid-cols-[1.4fr_1.6fr_1.1fr_1.4fr_1fr_auto]">
              <Field label="Employee" htmlFor="adj_employee">
                <select id="adj_employee" name="employee_id" required className="input">
                  {slipEmployees.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Description" htmlFor="adj_label">
                <input id="adj_label" name="label" required className="input" placeholder="Year-end bonus" />
              </Field>
              <Field label="Type" htmlFor="adj_kind">
                <select id="adj_kind" name="kind" className="input">
                  <option value="earning">Earning</option>
                  <option value="deduction">Deduction</option>
                </select>
              </Field>
              <Field label="CPF treatment" htmlFor="adj_cpf">
                <select id="adj_cpf" name="cpf_type" className="input" defaultValue="aw">
                  <option value="aw">Additional wage (bonus)</option>
                  <option value="ow">Ordinary wage (overtime)</option>
                  <option value="none">No CPF</option>
                </select>
              </Field>
              <Field label="Amount" htmlFor="adj_amount">
                <input id="adj_amount" name="amount" type="number" min="0.01" step="0.01" required className="input" />
              </Field>
              <SubmitButton className="btn btn-secondary" pendingText="Adding…">
                Add
              </SubmitButton>
            </div>
          </ActionForm>
        ) : null}
      </Section>

      {isDraft ? (
        <form action={deletePayRun} className="mt-6 text-right">
          <input type="hidden" name="id" value={run.id} />
          <button type="submit" className="btn btn-danger">
            Delete this draft
          </button>
        </form>
      ) : null}
    </>
  );
}
