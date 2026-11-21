import { EmptyState, Money, PageHeader, Section, StatusBadge } from "@/components/ui";
import { signAttachments } from "@/lib/data";
import { formatDate, todayISO } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Claim, ClaimCategory } from "@/lib/types";
import { withdrawClaim } from "./actions";
import { ClaimForm } from "./claim-form";

export const metadata = { title: "My claims" };

export default async function ClaimsPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const [catRes, claimsRes] = await Promise.all([
    supabase.from("claim_categories").select("*").eq("active", true).order("name"),
    supabase
      .from("claims")
      .select("*, category:claim_categories(name), pay_run:pay_runs(period_start, pay_date)")
      .eq("employee_id", session.employee.id)
      .order("expense_date", { ascending: false })
      .limit(100),
  ]);

  const categories = (catRes.data ?? []) as ClaimCategory[];
  const claims = (claimsRes.data ?? []) as (Claim & {
    category: { name: string };
    pay_run: { period_start: string; pay_date: string } | null;
  })[];
  const urls = await signAttachments(claims.map((c) => c.receipt_path));

  const waiting = claims.filter((c) => c.status === "pending").reduce((s, c) => s + Number(c.amount), 0);
  const toBePaid = claims.filter((c) => c.status === "approved").reduce((s, c) => s + Number(c.amount), 0);

  return (
    <>
      <PageHeader
        title="My claims"
        description="Approved claims are paid back with your next salary, tax free and outside CPF."
      />

      <div className="mb-6 grid gap-px overflow-hidden rounded-[10px] border border-rule bg-rule sm:grid-cols-2">
        <div className="bg-surface px-5 py-4">
          <p className="text-sm text-muted">Waiting for approval</p>
          <p className="mt-0.5 text-2xl font-bold text-ink">
            <Money value={waiting} />
          </p>
        </div>
        <div className="bg-surface px-5 py-4">
          <p className="text-sm text-muted">Approved, to be paid with salary</p>
          <p className="mt-0.5 text-2xl font-bold text-ink">
            <Money value={toBePaid} />
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Section title="History" flush>
          {claims.length === 0 ? (
            <EmptyState title="No claims yet">Paid for something for work? Submit it with a photo of the receipt.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Expense</th>
                    <th>Date</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {claims.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <p className="font-semibold">{c.category.name}</p>
                        <p className="text-xs text-muted">
                          {[c.merchant, c.description].filter(Boolean).join(", ")}
                        </p>
                        {c.receipt_path && urls.get(c.receipt_path) ? (
                          <a href={urls.get(c.receipt_path)} target="_blank" rel="noreferrer" className="link text-xs">
                            View receipt
                          </a>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap">{formatDate(c.expense_date)}</td>
                      <td className="num font-semibold">
                        <Money value={c.amount} />
                      </td>
                      <td>
                        <StatusBadge status={c.status} />
                        {c.pay_run && (c.status === "approved" || c.status === "paid") ? (
                          <p className="mt-1 text-xs text-muted">
                            {c.status === "paid" ? "Paid" : "Paying"} on {formatDate(c.pay_run.pay_date)}
                          </p>
                        ) : null}
                        {c.decision_note ? <p className="mt-1 text-xs text-muted">“{c.decision_note}”</p> : null}
                      </td>
                      <td className="num">
                        {c.status === "pending" ? (
                          <form action={withdrawClaim}>
                            <input type="hidden" name="id" value={c.id} />
                            <button type="submit" className="btn btn-secondary btn-sm">
                              Withdraw
                            </button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title="Submit a claim">
          {categories.length ? (
            <ClaimForm
              categories={categories}
              companyId={session.company.id}
              employeeId={session.employee.id}
              today={todayISO()}
            />
          ) : (
            <p className="text-sm text-muted">Your HR admin has not set up claim categories yet.</p>
          )}
        </Section>
      </div>
    </>
  );
}
