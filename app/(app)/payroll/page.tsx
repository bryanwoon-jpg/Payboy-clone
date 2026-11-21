import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { EmptyState, Field, Money, PageHeader, Section, StatusBadge } from "@/components/ui";
import { formatDate, formatMonth, todayISO } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { PayRun } from "@/lib/types";
import { createPayRun } from "./actions";

export const metadata = { title: "Payroll" };

export default async function PayrollPage() {
  const session = await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("pay_runs").select("*").order("period_start", { ascending: false });
  const runs = (data ?? []) as PayRun[];
  const thisMonth = todayISO().slice(0, 7);
  const hasThisMonth = runs.some((r) => r.period_start.startsWith(thisMonth));

  return (
    <>
      <PageHeader
        title="Payroll"
        description={`Monthly pay runs for ${session.company.name}. Salaries are paid on day ${session.company.payday} of each month.`}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Section title="Pay runs" flush>
          {runs.length === 0 ? (
            <EmptyState title="No pay runs yet">
              Start one for this month. Payslips are built from salaries, allowances, unpaid leave and approved claims,
              with CPF and SDL worked out for you.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Pay date</th>
                    <th className="num">People</th>
                    <th className="num">Gross</th>
                    <th className="num">Employer CPF</th>
                    <th className="num">Net pay</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/payroll/${r.id}`} className="link">
                          {formatMonth(r.period_start)}
                        </Link>
                      </td>
                      <td className="whitespace-nowrap">{formatDate(r.pay_date)}</td>
                      <td className="num">{r.employee_count}</td>
                      <td className="num">
                        <Money value={r.total_gross} />
                      </td>
                      <td className="num">
                        <Money value={r.total_employer_cpf} />
                      </td>
                      <td className="num font-semibold">
                        <Money value={r.total_net} />
                      </td>
                      <td>
                        <StatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Start a pay run">
          <ActionForm action={createPayRun} className="space-y-4">
            <Field label="Month" htmlFor="month" hint="One pay run per month. You can recalculate it until it is approved.">
              <input id="month" name="month" type="month" required defaultValue={thisMonth} className="input" />
            </Field>
            <SubmitButton className="btn btn-primary w-full" pendingText="Calculating…">
              {hasThisMonth ? "Start pay run" : `Start ${formatMonth(`${thisMonth}-01`)} pay run`}
            </SubmitButton>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}
