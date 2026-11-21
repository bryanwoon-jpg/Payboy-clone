import { redirect } from "next/navigation";
import { Avatar, EmptyState, Money, PageHeader, Section, StatusBadge, TabNav } from "@/components/ui";
import { getEmployeeDirectory, signAttachments } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Claim } from "@/lib/types";
import { decideClaim } from "../../claims/actions";
import { DecisionForm } from "../decision-form";

export const metadata = { title: "Claim approvals" };

type Row = Claim & { category: { name: string; monthly_limit: number | null } };

export default async function ClaimApprovalsPage() {
  const session = await requireSession();
  if (!session.isManager) redirect("/dashboard");
  const supabase = await createClient();

  const [pendingRes, recentRes, leaveCount, directory] = await Promise.all([
    supabase
      .from("claims")
      .select("*, category:claim_categories(name, monthly_limit)")
      .eq("status", "pending")
      .neq("employee_id", session.employee.id)
      .order("expense_date"),
    supabase
      .from("claims")
      .select("*, category:claim_categories(name, monthly_limit)")
      .in("status", ["approved", "rejected", "paid"])
      .neq("employee_id", session.employee.id)
      .order("decided_at", { ascending: false, nullsFirst: false })
      .limit(15),
    supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .neq("employee_id", session.employee.id),
    getEmployeeDirectory(),
  ]);

  const pending = (pendingRes.data ?? []) as Row[];
  const recent = (recentRes.data ?? []) as Row[];
  const urls = await signAttachments(pending.map((c) => c.receipt_path));
  const pendingTotal = pending.reduce((s, c) => s + Number(c.amount), 0);

  return (
    <>
      <PageHeader
        title="Approvals"
        description={session.isAdmin ? "Claims from everyone in the company." : "Claims from people who report to you."}
      />
      <TabNav
        current="/approvals/claims"
        tabs={[
          { href: "/approvals/leave", label: `Leave (${leaveCount.count ?? 0})` },
          { href: "/approvals/claims", label: `Claims (${pending.length})` },
        ]}
      />

      <Section
        title="Waiting for a decision"
        description={pending.length ? `${pending.length} claims worth ${new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(pendingTotal)}` : undefined}
        flush
        className="mb-6"
      >
        {pending.length === 0 ? (
          <EmptyState title="You are all caught up">New claims from your team will show up here.</EmptyState>
        ) : (
          <ul>
            {pending.map((c) => {
              const person = directory.byId.get(c.employee_id);
              return (
                <li key={c.id} className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e8ecf1] px-5 py-4 last:border-0">
                  <div className="flex min-w-0 gap-3">
                    <Avatar name={person?.full_name ?? "?"} />
                    <div className="min-w-0">
                      <p className="font-semibold text-ink">{person?.full_name ?? "Unknown"}</p>
                      <p className="text-sm text-ink-soft">
                        {c.category.name}, <Money value={c.amount} className="font-semibold" />, spent {formatDate(c.expense_date)}
                      </p>
                      {c.merchant || c.description ? (
                        <p className="mt-1 text-sm text-muted">{[c.merchant, c.description].filter(Boolean).join(": ")}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-muted">
                        Submitted {formatDate(c.created_at)}
                        {c.receipt_path && urls.get(c.receipt_path) ? (
                          <>
                            {". "}
                            <a href={urls.get(c.receipt_path)} target="_blank" rel="noreferrer" className="link">
                              View receipt
                            </a>
                          </>
                        ) : (
                          ". No receipt attached"
                        )}
                      </p>
                    </div>
                  </div>
                  <DecisionForm id={c.id} action={decideClaim} />
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
                {recent.map((c) => (
                  <tr key={c.id}>
                    <td className="font-semibold">{directory.byId.get(c.employee_id)?.full_name}</td>
                    <td>{c.category.name}</td>
                    <td>{formatDate(c.expense_date)}</td>
                    <td className="num">
                      <Money value={c.amount} />
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
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
