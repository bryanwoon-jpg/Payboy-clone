import Link from "next/link";
import { Avatar, PageHeader, Section, StatusBadge } from "@/components/ui";
import { formatDate, roleLabels } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Department, Employee } from "@/lib/types";

export const metadata = { title: "People" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ show?: string; q?: string }> }) {
  const session = await requireSession();
  const { show, q } = await searchParams;
  const supabase = await createClient();

  let query = supabase.from("employees").select("*").order("full_name");
  if (show !== "all") query = query.eq("status", "active");
  if (q) query = query.or(`full_name.ilike.%${q.replace(/[%,()]/g, "")}%,job_title.ilike.%${q.replace(/[%,()]/g, "")}%`);

  const [{ data: employeesData }, { data: deptData }, { data: allNames }] = await Promise.all([
    query,
    supabase.from("departments").select("id, name"),
    supabase.from("employees").select("id, full_name"),
  ]);
  const employees = (employeesData ?? []) as Employee[];
  const departments = new Map(((deptData ?? []) as Department[]).map((d) => [d.id, d.name]));
  const names = new Map((allNames ?? []).map((e) => [e.id, e.full_name]));

  return (
    <>
      <PageHeader
        title="People"
        description={`${employees.length} ${show === "all" ? "people, including those who have left" : "active employees"}`}
        actions={
          session.isAdmin ? (
            <Link href="/people/new" className="btn btn-primary">
              Add employee
            </Link>
          ) : null
        }
      />

      <form className="mb-4 flex flex-wrap items-center gap-3" role="search">
        <input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search by name or job title"
          className="input max-w-xs"
          aria-label="Search people"
        />
        <label className="flex items-center gap-2 text-sm text-ink-soft">
          <input type="checkbox" name="show" value="all" defaultChecked={show === "all"} className="h-4 w-4 accent-ledger" />
          Include people who have left
        </label>
        <button type="submit" className="btn btn-secondary">
          Apply
        </button>
      </form>

      <Section flush>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Department</th>
                <th>Reports to</th>
                <th>Access</th>
                <th>Started</th>
                {session.isAdmin ? <th>Sign-in</th> : null}
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={e.full_name} size="sm" />
                      <div>
                        {session.isAdmin ? (
                          <Link href={`/people/${e.id}`} className="link">
                            {e.full_name}
                          </Link>
                        ) : (
                          <p className="font-semibold">{e.full_name}</p>
                        )}
                        <p className="text-xs text-muted">
                          {e.job_title ?? "No title"}
                          {e.status === "terminated" ? (
                            <>
                              {" "}
                              <StatusBadge status="terminated" />
                            </>
                          ) : null}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>{e.department_id ? departments.get(e.department_id) : ""}</td>
                  <td>{e.manager_id ? names.get(e.manager_id) : ""}</td>
                  <td>{roleLabels[e.role]}</td>
                  <td className="whitespace-nowrap">{formatDate(e.hire_date)}</td>
                  {session.isAdmin ? (
                    <td className="text-sm">{e.user_id ? <span className="text-approved">Active</span> : <span className="text-muted">Not signed up</span>}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
