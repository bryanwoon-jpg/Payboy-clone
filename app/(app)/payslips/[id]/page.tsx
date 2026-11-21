import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Money } from "@/components/ui";
import { formatDate, formatMonth, residencyLabels } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Payslip, PayslipItem, ResidencyStatus } from "@/lib/types";

export const metadata = { title: "Payslip" };

type Slip = Payslip & {
  employee: { full_name: string; employee_code: string | null; job_title: string | null; hire_date: string };
  pay_run: { id: string; period_start: string; period_end: string; pay_date: string; status: string };
  company: { name: string; uen: string | null; address: string | null };
};

function Line({ label, amount, muted = false }: { label: string; amount: number; muted?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 text-sm ${muted ? "text-muted" : "text-ink"}`}>
      <span>{label}</span>
      <Money value={amount} className="shrink-0" />
    </div>
  );
}

export default async function PayslipPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("payslips")
    .select(
      "*, employee:employees(full_name, employee_code, job_title, hire_date), pay_run:pay_runs(id, period_start, period_end, pay_date, status), company:companies(name, uen, address)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const slip = data as unknown as Slip;

  const [{ data: itemData }, { data: comp }] = await Promise.all([
    supabase.from("payslip_items").select("*").eq("payslip_id", id).order("sort_order"),
    supabase.from("employee_compensation").select("bank_name, bank_account_no").eq("employee_id", slip.employee_id).maybeSingle(),
  ]);
  const items = (itemData ?? []) as PayslipItem[];
  const earnings = items.filter((i) => i.kind === "earning");
  const deductions = items.filter((i) => i.kind === "deduction");
  const reimbursements = items.filter((i) => i.kind === "reimbursement");
  const totalDeductions = Number(slip.employee_cpf) + Number(slip.total_deductions);
  const maskedAccount = comp?.bank_account_no ? `ending ${comp.bank_account_no.replace(/\D/g, "").slice(-4)}` : null;
  const backHref = session.isAdmin && slip.employee_id !== session.employee.id ? `/payroll/${slip.pay_run.id}` : "/payslips";

  return (
    <>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="text-sm font-semibold text-muted hover:text-ink">
          {backHref === "/payslips" ? "My payslips" : "Back to pay run"}
        </Link>
        <div className="flex items-center gap-3">
          {slip.pay_run.status === "draft" ? (
            <span className="rounded-full bg-pending-tint px-3 py-1 text-xs font-semibold text-pending">
              Draft: not visible to the employee yet
            </span>
          ) : null}
          <PrintButton />
        </div>
      </div>

      <article className="print-plain mx-auto max-w-3xl overflow-hidden rounded-[4px] bg-surface shadow-[0_1px_0_#d5dbe3,0_12px_32px_-18px_rgba(23,32,43,0.35)]">
        <div className="perforation" aria-hidden />
        <header className="flex flex-wrap items-start justify-between gap-4 px-8 pt-6 pb-6 sm:px-10">
          <div>
            <p className="text-lg font-bold text-ink">{slip.company.name}</p>
            {slip.company.uen ? <p className="text-sm text-muted">UEN {slip.company.uen}</p> : null}
            {slip.company.address ? <p className="text-sm text-muted">{slip.company.address}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-sm text-muted">Payslip for</p>
            <p className="text-lg font-bold text-ink">{formatMonth(slip.pay_run.period_start)}</p>
          </div>
        </header>

        <section className="grid gap-6 border-y border-dashed border-rule px-8 py-6 sm:grid-cols-[1fr_auto] sm:px-10">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <dt className="text-muted">Employee</dt>
              <dd className="font-semibold text-ink">{slip.employee.full_name}</dd>
            </div>
            <div>
              <dt className="text-muted">Employee ID</dt>
              <dd className="font-semibold text-ink">{slip.employee.employee_code ?? "None"}</dd>
            </div>
            <div>
              <dt className="text-muted">Job title</dt>
              <dd className="text-ink">{slip.employee.job_title ?? "None"}</dd>
            </div>
            <div>
              <dt className="text-muted">Pay period</dt>
              <dd className="text-ink">
                {formatDate(slip.pay_run.period_start)} to {formatDate(slip.pay_run.period_end)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Paid on</dt>
              <dd className="text-ink">{formatDate(slip.pay_run.pay_date)}</dd>
            </div>
            <div>
              <dt className="text-muted">Paid to</dt>
              <dd className="text-ink">
                {comp?.bank_name ? `${comp.bank_name}${maskedAccount ? `, ${maskedAccount}` : ""}` : "Bank details not set"}
              </dd>
            </div>
          </dl>
          <div className="sm:text-right">
            <p className="text-sm font-semibold text-muted">Net pay</p>
            <p className="text-[2.75rem] font-bold leading-none tracking-[-0.02em] text-ledger tabular-nums sm:text-[3.25rem]">
              <Money value={slip.net_pay} />
            </p>
          </div>
        </section>

        <section className="grid gap-8 px-8 py-6 sm:grid-cols-2 sm:px-10">
          <div>
            <h2 className="mb-1 border-b border-ink pb-1.5 text-sm font-bold text-ink">Earnings</h2>
            {earnings.map((i) => (
              <Line key={i.id} label={i.label} amount={i.amount} />
            ))}
            <div className="mt-1 flex justify-between border-t border-rule pt-2 text-sm font-bold">
              <span>Gross pay</span>
              <Money value={slip.gross_pay} />
            </div>
          </div>
          <div>
            <h2 className="mb-1 border-b border-ink pb-1.5 text-sm font-bold text-ink">Deductions</h2>
            <Line label="Employee CPF" amount={slip.employee_cpf} />
            {deductions.map((i) => (
              <Line key={i.id} label={i.label} amount={i.amount} />
            ))}
            <div className="mt-1 flex justify-between border-t border-rule pt-2 text-sm font-bold">
              <span>Total deductions</span>
              <Money value={totalDeductions} />
            </div>

            {reimbursements.length ? (
              <>
                <h2 className="mt-6 mb-1 border-b border-ink pb-1.5 text-sm font-bold text-ink">Claims reimbursed</h2>
                {reimbursements.map((i) => (
                  <Line key={i.id} label={i.label} amount={i.amount} />
                ))}
              </>
            ) : null}
          </div>
        </section>

        <section className="mx-8 mb-6 rounded-[6px] bg-canvas px-5 py-4 sm:mx-10">
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-ink-soft">
              Gross <Money value={slip.gross_pay} />, less deductions <Money value={totalDeductions} />
              {Number(slip.reimbursements) ? (
                <>
                  , plus claims <Money value={slip.reimbursements} />
                </>
              ) : null}
            </span>
            <span className="font-bold text-ink">
              Net pay <Money value={slip.net_pay} />
            </span>
          </div>
        </section>

        <footer className="grid gap-4 border-t border-dashed border-rule px-8 py-5 text-xs text-muted sm:grid-cols-3 sm:px-10">
          <div>
            <p className="font-semibold text-ink-soft">Employer CPF</p>
            <p>
              <Money value={slip.employer_cpf} /> paid by {slip.company.name} on top of your salary
            </p>
          </div>
          <div>
            <p className="font-semibold text-ink-soft">CPF wages</p>
            <p>
              Ordinary <Money value={slip.ordinary_wages} />
              {Number(slip.additional_wages) ? (
                <>
                  , additional <Money value={slip.additional_wages} />
                </>
              ) : null}
            </p>
          </div>
          <div>
            <p className="font-semibold text-ink-soft">CPF basis</p>
            <p>
              {slip.residency ? residencyLabels[slip.residency as ResidencyStatus] : ""}
              {slip.cpf_age != null ? `, age ${slip.cpf_age}` : ""}
            </p>
          </div>
        </footer>
      </article>
    </>
  );
}
