import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader, Section } from "@/components/ui";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { addDepartment, deleteDepartment, updateCompany } from "./actions";
import { SettingsTabs } from "./tabs";

export const metadata = { title: "Settings" };

const weekdays = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [7, "Sun"],
] as const;

export default async function SettingsPage() {
  const session = await requireAdmin();
  const supabase = await createClient();
  const [{ data: departments }, { data: counts }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("employees").select("department_id").eq("status", "active"),
  ]);
  const headcount = new Map<string, number>();
  for (const row of counts ?? []) {
    if (row.department_id) headcount.set(row.department_id, (headcount.get(row.department_id) ?? 0) + 1);
  }
  const c = session.company;

  return (
    <>
      <PageHeader title="Settings" description="Company details, working week and payday." />
      <SettingsTabs current="/settings" />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Section title="Company">
          <ActionForm action={updateCompany} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Company name" htmlFor="name">
                <input id="name" name="name" required defaultValue={c.name} className="input" />
              </Field>
              <Field label="UEN" htmlFor="uen">
                <input id="uen" name="uen" defaultValue={c.uen ?? ""} className="input" />
              </Field>
              <Field label="Address" htmlFor="address" className="sm:col-span-2" hint="Printed on payslips.">
                <input id="address" name="address" defaultValue={c.address ?? ""} className="input" />
              </Field>
              <Field label="Industry" htmlFor="industry">
                <input id="industry" name="industry" defaultValue={c.industry ?? ""} className="input" placeholder="Retail" />
              </Field>
              <Field label="Payday" htmlFor="payday" hint="Day of the month salaries are paid. Short months use their last day.">
                <input id="payday" name="payday" type="number" min={1} max={31} required defaultValue={c.payday} className="input" />
              </Field>
            </div>
            <fieldset>
              <legend className="label">Working days</legend>
              <p className="mb-2 text-xs text-muted">Leave and salary proration only count these days.</p>
              <div className="flex flex-wrap gap-2">
                {weekdays.map(([value, label]) => (
                  <label key={value} className="cursor-pointer">
                    <input
                      type="checkbox"
                      name="work_days"
                      value={value}
                      defaultChecked={c.work_days.includes(value)}
                      className="peer sr-only"
                    />
                    <span className="inline-block rounded-[6px] border border-rule px-3 py-1.5 text-sm font-semibold text-muted peer-checked:border-ledger peer-checked:bg-ledger-tint peer-checked:text-ledger peer-focus-visible:outline-2 peer-focus-visible:outline-ledger">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="flex justify-end">
              <SubmitButton>Save company</SubmitButton>
            </div>
          </ActionForm>
        </Section>

        <Section title="Departments" flush>
          <ul>
            {(departments ?? []).map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 border-b border-[#e8ecf1] px-5 py-2.5 text-sm">
                <span>
                  <span className="font-semibold">{d.name}</span>
                  <span className="text-muted"> {headcount.get(d.id) ?? 0} people</span>
                </span>
                <form action={deleteDepartment}>
                  <input type="hidden" name="id" value={d.id} />
                  <button type="submit" className="text-xs font-semibold text-muted hover:text-rejected">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
          <ActionForm action={addDepartment} resetOnSuccess className="p-5">
            <div className="flex gap-2">
              <input name="name" required className="input" placeholder="New department" aria-label="New department name" />
              <SubmitButton className="btn btn-secondary">Add</SubmitButton>
            </div>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}
