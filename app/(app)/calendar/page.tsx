import Link from "next/link";
import { PageHeader, Section } from "@/components/ui";
import { formatMonth, todayISO } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Leave calendar" };

type Req = {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  half_day: string;
  status: string;
  leave_type: { name: string; color: string };
};

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const session = await requireSession();
  const { m } = await searchParams;
  const today = todayISO();
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : today.slice(0, 7);
  const [y, mo] = month.split("-").map(Number);
  const first = new Date(y, mo - 1, 1);
  const last = new Date(y, mo, 0);
  const prev = iso(new Date(y, mo - 2, 1)).slice(0, 7);
  const next = iso(new Date(y, mo, 1)).slice(0, 7);
  const days = Array.from({ length: last.getDate() }, (_, i) => new Date(y, mo - 1, i + 1));
  const startISO = iso(first);
  const endISO = iso(last);

  const supabase = await createClient();
  const [{ data: people }, { data: reqs }, { data: holidays }] = await Promise.all([
    supabase.from("employees").select("id, full_name, job_title").eq("status", "active").order("full_name"),
    supabase
      .from("leave_requests")
      .select("id, employee_id, start_date, end_date, half_day, status, leave_type:leave_types(name, color)")
      .in("status", ["approved", "pending"])
      .lte("start_date", endISO)
      .gte("end_date", startISO),
    supabase.from("public_holidays").select("holiday_date, name").gte("holiday_date", startISO).lte("holiday_date", endISO),
  ]);

  const requests = (reqs ?? []) as unknown as Req[];
  const holidayMap = new Map((holidays ?? []).map((h) => [h.holiday_date, h.name]));
  const workDays = new Set(session.company.work_days);
  const visibleIds = new Set(requests.map((r) => r.employee_id));
  const rows = session.isAdmin
    ? (people ?? [])
    : (people ?? []).filter((p) => p.id === session.employee.id || visibleIds.has(p.id));

  const cellFor = (employeeId: string, day: string) =>
    requests.find((r) => r.employee_id === employeeId && r.start_date <= day && r.end_date >= day);

  const legend = new Map(requests.map((r) => [r.leave_type.name, r.leave_type.color]));

  return (
    <>
      <PageHeader
        title="Leave calendar"
        description={
          session.isAdmin
            ? "Everyone's approved and pending leave."
            : "Your leave and leave for the people who report to you."
        }
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/calendar?m=${prev}`} className="btn btn-secondary" aria-label="Previous month">
              Previous
            </Link>
            <span className="min-w-36 text-center font-semibold">{formatMonth(`${month}-01`)}</span>
            <Link href={`/calendar?m=${next}`} className="btn btn-secondary" aria-label="Next month">
              Next
            </Link>
          </div>
        }
      />

      <Section flush>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-44 border-b border-rule bg-surface px-4 py-2 text-left text-sm font-semibold text-muted">
                  Person
                </th>
                {days.map((d) => {
                  const key = iso(d);
                  const rest = !workDays.has(((d.getDay() + 6) % 7) + 1);
                  const holiday = holidayMap.get(key);
                  return (
                    <th
                      key={key}
                      title={holiday}
                      className={`min-w-8 border-b border-rule px-0.5 py-2 text-center font-semibold ${
                        key === today ? "text-ledger" : rest || holiday ? "text-faint" : "text-muted"
                      }`}
                    >
                      <div>{d.toLocaleDateString("en-SG", { weekday: "narrow" })}</div>
                      <div className={key === today ? "mx-auto mt-0.5 w-5 rounded-full bg-ledger text-white" : "mt-0.5"}>
                        {d.getDate()}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="sticky left-0 z-10 border-b border-[#e8ecf1] bg-surface px-4 py-2">
                    <p className="text-sm font-semibold text-ink">{p.full_name}</p>
                    <p className="text-muted">{p.job_title}</p>
                  </td>
                  {days.map((d) => {
                    const key = iso(d);
                    const rest = !workDays.has(((d.getDay() + 6) % 7) + 1);
                    const holiday = holidayMap.has(key);
                    const r = rest || holiday ? undefined : cellFor(p.id, key);
                    return (
                      <td
                        key={key}
                        className={`border-b border-l border-[#eef1f5] p-0.5 ${rest || holiday ? "bg-canvas" : ""}`}
                      >
                        {r ? (
                          <div
                            title={`${r.leave_type.name}${r.status === "pending" ? " (pending)" : ""}${r.half_day !== "none" ? `, ${r.half_day === "am" ? "morning" : "afternoon"}` : ""}`}
                            className="h-6 rounded-[3px]"
                            style={
                              r.status === "approved"
                                ? { background: r.leave_type.color, width: r.half_day !== "none" ? "50%" : undefined }
                                : {
                                    backgroundImage: `repeating-linear-gradient(135deg, ${r.leave_type.color}55 0 4px, transparent 4px 8px)`,
                                    border: `1px solid ${r.leave_type.color}`,
                                  }
                            }
                          />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-rule px-5 py-3 text-xs text-muted">
          {[...legend.entries()].map(([name, color]) => (
            <span key={name} className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[3px]" style={{ background: color }} aria-hidden />
              {name}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span
              className="h-3 w-3 rounded-[3px] border border-faint"
              style={{ backgroundImage: "repeating-linear-gradient(135deg, #8a94a355 0 3px, transparent 3px 6px)" }}
              aria-hidden
            />
            Pending approval
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-[3px] bg-canvas ring-1 ring-rule" aria-hidden />
            Rest day or public holiday
          </span>
        </div>
      </Section>

      {holidays && holidays.length ? (
        <p className="mt-4 text-sm text-muted">
          Public holidays this month: {holidays.map((h) => `${h.name} (${new Date(`${h.holiday_date}T00:00:00`).getDate()})`).join(", ")}
        </p>
      ) : null}
    </>
  );
}
