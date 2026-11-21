import { redirect } from "next/navigation";
import { Avatar, EmptyState, PageHeader, Section, StatusBadge, TabNav } from "@/components/ui";
import { getEmployeeDirectory, signAttachments } from "@/lib/data";
import { formatDate, formatDateRange, formatDays, todayISO } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { LeaveBalance, LeaveRequest } from "@/lib/types";
import { decideLeave } from "../../leave/actions";
import { DecisionForm } from "../decision-form";

export const metadata = { title: "Leave approvals" };

type Row = LeaveRequest & { leave_type: { name: string; color: string } };

export default async function LeaveApprovalsPage() {
  const session = await requireSession();
  if (!session.isManager) redirect("/dashboard");
  const supabase = await createClient();
  const year = Number(todayISO().slice(0, 4));

  const [pendingRes, recentRes, directory] = await Promise.all([
    supabase
      .from("leave_requests")
      .select("*, leave_type:leave_types(name, color)")
      .eq("status", "pending")
      .neq("employee_id", session.employee.id)
      .order("start_date"),
    supabase
      .from("leave_requests")
      .select("*, leave_type:leave_types(name, color)")
      .in("status", ["approved", "rejected"])
      .neq("employee_id", session.employee.id)
      .not("decided_at", "is", null)
      .order("decided_at", { ascending: false })
      .limit(15),
    getEmployeeDirectory(),
  ]);

  const pending = (pendingRes.data ?? []) as Row[];
  const recent = (recentRes.data ?? []) as Row[];
  const urls = await signAttachments(pending.map((r) => r.attachment_path));

  const employeeIds = [...new Set(pending.map((r) => r.employee_id))];
  const { data: balanceRows } = employeeIds.length
    ? await supabase.from("leave_balances").select("*").in("employee_id", employeeIds).eq("year", year)
    : { data: [] };
  const balances = (balanceRows ?? []) as LeaveBalance[];
  const balanceFor = (employeeId: string, typeId: string) =>
    balances.find((b) => b.employee_id === employeeId && b.leave_type_id === typeId);

  return (
    <>
      <PageHeader
        title="Approvals"
        description={session.isAdmin ? "Requests from everyone in the company." : "Requests from people who report to you."}
      />
      <TabNav
        current="/approvals/leave"
        tabs={[
          { href: "/approvals/leave", label: `Leave (${pending.length})` },
          { href: "/approvals/claims", label: "Claims" },
        ]}
      />

      <Section title="Waiting for a decision" flush className="mb-6">
        {pending.length === 0 ? (
          <EmptyState title="You are all caught up">New leave requests from your team will show up here.</EmptyState>
        ) : (
          <ul>
            {pending.map((r) => {
              const person = directory.byId.get(r.employee_id);
              const bal = balanceFor(r.employee_id, r.leave_type_id);
              const leftAfter =
                bal && bal.entitled != null ? Number(bal.entitled) - Number(bal.taken) - Number(bal.pending) : null;
              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e8ecf1] px-5 py-4 last:border-0">
                  <div className="flex min-w-0 gap-3">
                    <Avatar name={person?.full_name ?? "?"} />
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{person?.full_name ?? "Unknown"}</p>
                      <p className="text-sm text-ink-soft">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 rounded-full" style={{ background: r.leave_type.color }} aria-hidden />
                          {r.leave_type.name}
                        </span>
                        {", "}
                        {formatDateRange(r.start_date, r.end_date)}
                        {r.half_day !== "none" ? ` (${r.half_day === "am" ? "morning" : "afternoon"})` : ""}
                        {", "}
                        <span className="font-semibold">{formatDays(r.days)}</span>
                      </p>
                      {r.reason ? <p className="mt-1 text-sm text-muted">“{r.reason}”</p> : null}
                      <p className="mt-1 text-xs text-muted">
                        {leftAfter != null ? `${formatDays(leftAfter)} left after this request. ` : ""}
                        Applied {formatDate(r.created_at)}
                        {r.attachment_path && urls.get(r.attachment_path) ? (
                          <>
                            {". "}
                            <a href={urls.get(r.attachment_path)} target="_blank" rel="noreferrer" className="link">
                              View document
                            </a>
                          </>
                        ) : null}
                      </p>
                    </div>
                  </div>
                  <DecisionForm id={r.id} action={decideLeave} />
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Recently decided" flush>
        {recent.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Nothing decided yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="font-semibold">{directory.byId.get(r.employee_id)?.full_name}</td>
                    <td>{r.leave_type.name}</td>
                    <td>{formatDateRange(r.start_date, r.end_date)}</td>
                    <td className="num">{formatDays(r.days)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="text-muted">
                      {r.approver_id ? `by ${directory.byId.get(r.approver_id)?.full_name ?? "someone"}` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
