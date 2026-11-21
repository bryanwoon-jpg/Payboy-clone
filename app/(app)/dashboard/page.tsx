import Link from "next/link";
import { Money, PageHeader, Section, Stat, StatusBadge } from "@/components/ui";
import { formatDate, formatDateRange, formatDays, formatMonth, todayISO } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { LeaveBalance, LeaveRequest, PayRun } from "@/lib/types";

export const metadata = { title: "Overview" };

export default async function DashboardPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const today = todayISO();
  const year = Number(today.slice(0, 4));
  const me = session.employee.id;

  const [balancesRes, upcomingRes, holidaysRes, payslipRes, claimsRes] = await Promise.all([
    supabase.from("leave_balances").select("*").eq("employee_id", me).eq("year", year).order("leave_type_name"),
    supabase
      .from("leave_requests")
      .select("*, leave_type:leave_types(name, color)")
      .eq("employee_id", me)
      .in("status", ["pending", "approved"])
      .gte("end_date", today)
      .order("start_date")
      .limit(4),
    supabase.from("public_holidays").select("holiday_date, name").gte("holiday_date", today).order("holiday_date").limit(4),
    supabase
      .from("payslips")
      .select("id, net_pay, pay_run:pay_runs(period_start, pay_date, status)")
      .eq("employee_id", me)
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("claims").select("amount, status").eq("employee_id", me).in("status", ["pending", "approved"]),
  ]);

  const balances = (balancesRes.data ?? []) as LeaveBalance[];
  const upcoming = (upcomingRes.data ?? []) as (LeaveRequest & { leave_type: { name: string; color: string } })[];
  const holidays = holidaysRes.data ?? [];
  type SlipRow = { id: string; net_pay: number; pay_run: { period_start: string; pay_date: string; status: string } };
  const latestSlip = ((payslipRes.data ?? []) as unknown as SlipRow[])
    .filter((s) => s.pay_run && s.pay_run.status !== "draft")
    .sort((a, b) => b.pay_run.period_start.localeCompare(a.pay_run.period_start))[0];
  const openClaims = claimsRes.data ?? [];
  const openClaimTotal = openClaims.reduce((sum, c) => sum + Number(c.amount), 0);

  let admin: { headcount: number; lastRun: PayRun | null; pendingLeave: number; pendingClaims: number } | null = null;
  if (session.isManager) {
    const [headcount, lastRun, pendingLeave, pendingClaims] = await Promise.all([
      supabase.from("employees").select("id", { count: "exact", head: true }).eq("status", "active"),
      session.isAdmin
        ? supabase.from("pay_runs").select("*").order("period_start", { ascending: false }).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("leave_requests").select("id", { count: "exact", head: true }).eq("status", "pending").neq("employee_id", me),
      supabase.from("claims").select("id", { count: "exact", head: true }).eq("status", "pending").neq("employee_id", me),
    ]);
    admin = {
      headcount: headcount.count ?? 0,
      lastRun: (lastRun.data as PayRun | null) ?? null,
      pendingLeave: pendingLeave.count ?? 0,
      pendingClaims: pendingClaims.count ?? 0,
    };
  }

  const annual = balances.find((b) => b.leave_type_code === "AL");
  const annualLeft = annual?.entitled != null ? Number(annual.entitled) - Number(annual.taken) - Number(annual.pending) : null;

  return (
    <>
      <PageHeader
        title={`Hello, ${session.employee.full_name.split(" ")[0]}`}
        description={`${session.employee.job_title ?? "Team member"} at ${session.company.name}`}
        actions={
          <>
            <Link href="/leave" className="btn btn-secondary">
              Apply for leave
            </Link>
            <Link href="/claims" className="btn btn-primary">
              Submit a claim
            </Link>
          </>
        }
      />

      {admin ? (
        <Section className="mb-6">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Active employees" value={admin.headcount} />
            <Stat
              label="Leave waiting for you"
              value={admin.pendingLeave}
              note={
                admin.pendingLeave ? (
                  <Link href="/approvals/leave" className="link">
                    Review requests
                  </Link>
                ) : (
                  "All clear"
                )
              }
            />
            <Stat
              label="Claims waiting for you"
              value={admin.pendingClaims}
              note={
                admin.pendingClaims ? (
                  <Link href="/approvals/claims" className="link">
                    Review claims
                  </Link>
                ) : (
                  "All clear"
                )
              }
            />
            {session.isAdmin ? (
              <Stat
                label={admin.lastRun ? `Payroll, ${formatMonth(admin.lastRun.period_start)}` : "Payroll"}
                value={admin.lastRun ? <Money value={admin.lastRun.total_net} /> : "Not run yet"}
                note={
                  admin.lastRun ? (
                    <Link href={`/payroll/${admin.lastRun.id}`} className="link">
                      Net pay for {admin.lastRun.employee_count} people, {admin.lastRun.status}
                    </Link>
                  ) : (
                    <Link href="/payroll" className="link">
                      Start your first pay run
                    </Link>
                  )
                }
              />
            ) : null}
          </div>
        </Section>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Section
          title="Leave balance"
          description={`${year}, after approved and pending requests`}
          className="lg:col-span-2"
          flush
        >
          {annualLeft !== null ? (
            <div className="border-b border-rule px-5 py-4">
              <p className="text-sm text-muted">Annual leave you can still take</p>
              <p className="mt-0.5 text-4xl font-bold tabular-nums text-ink">{formatDays(annualLeft)}</p>
            </div>
          ) : null}
          <table className="table">
            <thead>
              <tr>
                <th>Type</th>
                <th className="num">Entitled</th>
                <th className="num">Taken</th>
                <th className="num">Pending</th>
                <th className="num">Left</th>
              </tr>
            </thead>
            <tbody>
              {balances.map((b) => (
                <tr key={b.leave_type_id}>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} aria-hidden />
                      {b.leave_type_name}
                    </span>
                  </td>
                  <td className="num">{b.entitled == null ? "No limit" : Number(b.entitled)}</td>
                  <td className="num">{Number(b.taken)}</td>
                  <td className="num">{Number(b.pending)}</td>
                  <td className="num font-semibold">
                    {b.entitled == null ? "" : Number(b.entitled) - Number(b.taken) - Number(b.pending)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <div className="space-y-6">
          <Section title="Latest payslip">
            {latestSlip ? (
              <>
                <p className="text-sm text-muted">{formatMonth(latestSlip.pay_run.period_start)} net pay</p>
                <p className="mt-0.5 text-3xl font-bold text-ink">
                  <Money value={latestSlip.net_pay} />
                </p>
                <p className="mt-1 text-sm text-muted">Paid on {formatDate(latestSlip.pay_run.pay_date)}</p>
                <Link href={`/payslips/${latestSlip.id}`} className="link mt-3 inline-block text-sm">
                  View payslip
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted">Your payslips appear here once payroll is approved.</p>
            )}
          </Section>

          <Section title="Open claims">
            <p className="text-3xl font-bold text-ink">
              <Money value={openClaimTotal} />
            </p>
            <p className="mt-1 text-sm text-muted">
              {openClaims.length === 0
                ? "Nothing waiting to be reimbursed."
                : `${openClaims.length} claim${openClaims.length === 1 ? "" : "s"} pending or waiting for the next pay run.`}
            </p>
          </Section>
        </div>

        <Section title="Your upcoming leave" className="lg:col-span-2" flush>
          {upcoming.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted">No leave booked. Plan a break around the public holidays.</p>
          ) : (
            <table className="table">
              <tbody>
                {upcoming.map((r) => (
                  <tr key={r.id}>
                    <td>{r.leave_type.name}</td>
                    <td>{formatDateRange(r.start_date, r.end_date)}</td>
                    <td className="num">{formatDays(r.days)}</td>
                    <td className="num">
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        <Section title="Public holidays" flush>
          <ul>
            {holidays.map((h) => (
              <li key={`${h.holiday_date}${h.name}`} className="flex justify-between gap-3 border-b border-[#e8ecf1] px-5 py-2.5 text-sm last:border-0">
                <span>{h.name}</span>
                <span className="text-muted">{formatDate(h.holiday_date)}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
