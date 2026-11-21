import Link from "next/link";
import { EmptyState, Money, PageHeader, Section } from "@/components/ui";
import { formatDate, formatMonth } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "My payslips" };

type Row = {
  id: string;
  gross_pay: number;
  employee_cpf: number;
  reimbursements: number;
  net_pay: number;
  pay_run: { period_start: string; pay_date: string; status: string };
};

export default async function PayslipsPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data } = await supabase
    .from("payslips")
    .select("id, gross_pay, employee_cpf, reimbursements, net_pay, pay_run:pay_runs(period_start, pay_date, status)")
    .eq("employee_id", session.employee.id);

  const slips = ((data ?? []) as unknown as Row[])
    .filter((s) => s.pay_run && s.pay_run.status !== "draft")
    .sort((a, b) => b.pay_run.period_start.localeCompare(a.pay_run.period_start));

  const year = new Date().getFullYear();
  const ytd = slips.filter((s) => s.pay_run.period_start.startsWith(String(year)));
  const ytdNet = ytd.reduce((sum, s) => sum + Number(s.net_pay), 0);
  const ytdCpf = ytd.reduce((sum, s) => sum + Number(s.employee_cpf), 0);

  return (
    <>
      <PageHeader title="My payslips" description="Payslips appear here once HR approves the month's payroll." />

      {ytd.length ? (
        <div className="mb-6 grid gap-px overflow-hidden rounded-[10px] border border-rule bg-rule sm:grid-cols-2">
          <div className="bg-surface px-5 py-4">
            <p className="text-sm text-muted">Net pay received in {year}</p>
            <p className="mt-0.5 text-2xl font-bold">
              <Money value={ytdNet} />
            </p>
          </div>
          <div className="bg-surface px-5 py-4">
            <p className="text-sm text-muted">Your CPF contributions in {year}</p>
            <p className="mt-0.5 text-2xl font-bold">
              <Money value={ytdCpf} />
            </p>
          </div>
        </div>
      ) : null}

      <Section flush>
        {slips.length === 0 ? (
          <EmptyState title="No payslips yet">Your first payslip shows up after your company runs payroll.</EmptyState>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Paid on</th>
                <th className="num">Gross</th>
                <th className="num">Your CPF</th>
                <th className="num">Net pay</th>
              </tr>
            </thead>
            <tbody>
              {slips.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={`/payslips/${s.id}`} className="link">
                      {formatMonth(s.pay_run.period_start)}
                    </Link>
                  </td>
                  <td>{formatDate(s.pay_run.pay_date)}</td>
                  <td className="num">
                    <Money value={s.gross_pay} />
                  </td>
                  <td className="num">
                    <Money value={s.employee_cpf} />
                  </td>
                  <td className="num font-semibold">
                    <Money value={s.net_pay} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </>
  );
}
