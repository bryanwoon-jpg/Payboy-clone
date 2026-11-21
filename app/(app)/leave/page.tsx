import { PageHeader, Section, StatusBadge, EmptyState } from "@/components/ui";
import { signAttachments } from "@/lib/data";
import { formatDate, formatDateRange, formatDays, todayISO } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { LeaveBalance, LeaveRequest, LeaveType } from "@/lib/types";
import { cancelLeave } from "./actions";
import { ApplyLeaveForm } from "./apply-form";

export const metadata = { title: "My leave" };

export default async function LeavePage() {
  const session = await requireSession();
  const supabase = await createClient();
  const today = todayISO();
  const year = Number(today.slice(0, 4));

  const [typesRes, balancesRes, requestsRes] = await Promise.all([
    supabase.from("leave_types").select("*").eq("active", true).order("name"),
    supabase.from("leave_balances").select("*").eq("employee_id", session.employee.id).eq("year", year).order("leave_type_name"),
    supabase
      .from("leave_requests")
      .select("*, leave_type:leave_types(name, color)")
      .eq("employee_id", session.employee.id)
      .order("start_date", { ascending: false })
      .limit(50),
  ]);

  const leaveTypes = (typesRes.data ?? []) as LeaveType[];
  const balances = (balancesRes.data ?? []) as LeaveBalance[];
  const requests = (requestsRes.data ?? []) as (LeaveRequest & { leave_type: { name: string; color: string } })[];
  const urls = await signAttachments(requests.map((r) => r.attachment_path));

  return (
    <>
      <PageHeader title="My leave" description={`Your balances for ${year} and every request you have made.`} />

      <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-6">
        {balances.map((b) => {
          const left = b.entitled == null ? null : Number(b.entitled) - Number(b.taken) - Number(b.pending);
          return (
            <div key={b.leave_type_id} className="bg-surface px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <span className="h-2 w-2 rounded-full" style={{ background: b.color }} aria-hidden />
                {b.leave_type_name}
              </p>
              <p className="mt-1 text-xl font-bold tabular-nums text-ink">{left == null ? "No limit" : left}</p>
              <p className="text-xs text-muted">
                {b.entitled == null ? `${Number(b.taken)} taken` : `of ${Number(b.entitled)} days`}
              </p>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Section title="Requests" flush>
          {requests.length === 0 ? (
            <EmptyState title="No leave requests yet">Use the form to apply. Your manager gets it straight away.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Dates</th>
                    <th className="num">Days</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => {
                    const canCancel = r.status === "pending" || (r.status === "approved" && r.start_date > today);
                    return (
                      <tr key={r.id}>
                        <td>
                          <span className="inline-flex items-center gap-2 font-semibold">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.leave_type.color }} aria-hidden />
                            {r.leave_type.name}
                          </span>
                          {r.reason ? <p className="mt-0.5 text-xs text-muted">{r.reason}</p> : null}
                          {r.attachment_path && urls.get(r.attachment_path) ? (
                            <a href={urls.get(r.attachment_path)} target="_blank" rel="noreferrer" className="link text-xs">
                              View document
                            </a>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap">
                          {formatDateRange(r.start_date, r.end_date)}
                          {r.half_day !== "none" ? <span className="text-muted"> ({r.half_day === "am" ? "morning" : "afternoon"})</span> : null}
                        </td>
                        <td className="num">{formatDays(r.days)}</td>
                        <td>
                          <StatusBadge status={r.status} />
                          {r.decision_note ? <p className="mt-1 text-xs text-muted">“{r.decision_note}”</p> : null}
                          {r.decided_at ? <p className="text-xs text-faint">{formatDate(r.decided_at)}</p> : null}
                        </td>
                        <td className="num">
                          {canCancel ? (
                            <form action={cancelLeave}>
                              <input type="hidden" name="id" value={r.id} />
                              <button type="submit" className="btn btn-secondary btn-sm">
                                Cancel
                              </button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Apply for leave">
          {leaveTypes.length ? (
            <ApplyLeaveForm
              leaveTypes={leaveTypes}
              companyId={session.company.id}
              employeeId={session.employee.id}
              today={today}
            />
          ) : (
            <p className="text-sm text-muted">Your HR admin has not set up leave types yet.</p>
          )}
        </Section>
      </div>
    </>
  );
}
