import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader, Section } from "@/components/ui";
import { formatDate, todayISO } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { LeaveType } from "@/lib/types";
import { addHoliday, deleteHoliday, saveLeaveType } from "../actions";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "Leave settings" };

function LeaveTypeFields({ type }: { type?: LeaveType }) {
  return (
    <div className="grid gap-4 sm:grid-cols-4">
      {type ? <input type="hidden" name="id" value={type.id} /> : null}
      <Field label="Name" htmlFor={`name_${type?.id ?? "new"}`} className="sm:col-span-2">
        <input id={`name_${type?.id ?? "new"}`} name="name" required defaultValue={type?.name} className="input" />
      </Field>
      <Field label="Code" htmlFor={`code_${type?.id ?? "new"}`}>
        <input id={`code_${type?.id ?? "new"}`} name="code" required maxLength={6} defaultValue={type?.code} className="input uppercase" />
      </Field>
      <Field label="Colour" htmlFor={`color_${type?.id ?? "new"}`}>
        <input id={`color_${type?.id ?? "new"}`} name="color" type="color" defaultValue={type?.color ?? "#234E8C"} className="input h-[38px] p-1" />
      </Field>
      <Field label="Days a year" htmlFor={`ent_${type?.id ?? "new"}`}>
        <input
          id={`ent_${type?.id ?? "new"}`}
          name="default_entitlement"
          type="number"
          step="0.5"
          min="0"
          defaultValue={type?.default_entitlement ?? 14}
          className="input"
        />
      </Field>
      <Field label="Carry forward up to" htmlFor={`cf_${type?.id ?? "new"}`}>
        <input
          id={`cf_${type?.id ?? "new"}`}
          name="carry_forward_limit"
          type="number"
          step="0.5"
          min="0"
          defaultValue={type?.carry_forward_limit ?? 0}
          className="input"
        />
      </Field>
      <div className="flex flex-col justify-end gap-2 text-sm text-ink-soft sm:col-span-2">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="unlimited" defaultChecked={type ? type.default_entitlement === null : false} className="h-4 w-4 accent-ledger" />
            No yearly limit
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_paid" defaultChecked={type?.is_paid ?? true} className="h-4 w-4 accent-ledger" />
            Paid
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="allow_half_day" defaultChecked={type?.allow_half_day ?? true} className="h-4 w-4 accent-ledger" />
            Half days allowed
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="requires_attachment" defaultChecked={type?.requires_attachment ?? false} className="h-4 w-4 accent-ledger" />
            Needs a document
          </label>
          {type ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" name="active" defaultChecked={type.active} className="h-4 w-4 accent-ledger" />
              In use
            </label>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default async function LeaveSettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: types }, { data: holidays }] = await Promise.all([
    supabase.from("leave_types").select("*").order("active", { ascending: false }).order("name"),
    supabase.from("public_holidays").select("*").gte("holiday_date", `${today.slice(0, 4)}-01-01`).order("holiday_date"),
  ]);
  const leaveTypes = (types ?? []) as LeaveType[];
  const national = (holidays ?? []).filter((h) => h.company_id === null);
  const company = (holidays ?? []).filter((h) => h.company_id !== null);

  return (
    <>
      <PageHeader title="Settings" description="Leave types, yearly entitlements and the holidays that do not count as leave." />
      <SettingsTabs current="/settings/leave" />

      <Section title="Leave types" description="Unpaid leave types reduce basic salary in the pay run." flush className="mb-6">
        <ul>
          {leaveTypes.map((t) => (
            <li key={t.id} className="border-b border-[#e8ecf1] last:border-0">
              <details>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 hover:bg-canvas/60">
                  <span className="inline-flex items-center gap-2.5">
                    <span className="h-3 w-3 rounded-full" style={{ background: t.color }} aria-hidden />
                    <span className={`font-semibold ${t.active ? "text-ink" : "text-faint line-through"}`}>{t.name}</span>
                    <span className="text-sm text-muted">{t.code}</span>
                  </span>
                  <span className="text-sm text-muted">
                    {t.default_entitlement === null ? "No limit" : `${Number(t.default_entitlement)} days`}
                    {t.is_paid ? "" : ", unpaid"}
                    {t.requires_attachment ? ", document needed" : ""}
                    <span className="ml-3 font-semibold text-ledger">Edit</span>
                  </span>
                </summary>
                <ActionForm action={saveLeaveType} className="border-t border-rule bg-canvas/40 px-5 py-4">
                  <LeaveTypeFields type={t} />
                  <div className="mt-4 flex justify-end">
                    <SubmitButton>Save {t.name}</SubmitButton>
                  </div>
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
        <details className="border-t border-rule">
          <summary className="cursor-pointer list-none px-5 py-3 text-sm font-semibold text-ledger">Add a leave type</summary>
          <ActionForm action={saveLeaveType} resetOnSuccess className="border-t border-rule px-5 py-4">
            <LeaveTypeFields />
            <div className="mt-4 flex justify-end">
              <SubmitButton>Add leave type</SubmitButton>
            </div>
          </ActionForm>
        </details>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Singapore public holidays" description="Gazetted by MOM and applied to every company." flush>
          <ul className="max-h-96 overflow-y-auto">
            {national.map((h) => (
              <li key={h.id} className="flex justify-between gap-3 border-b border-[#e8ecf1] px-5 py-2 text-sm last:border-0">
                <span>{h.name}</span>
                <span className="text-muted">{formatDate(h.holiday_date)}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Company holidays" description="Extra days off for your company only, like a company anniversary." flush>
          {company.length ? (
            <ul>
              {company.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 border-b border-[#e8ecf1] px-5 py-2 text-sm">
                  <span>
                    {h.name} <span className="text-muted">{formatDate(h.holiday_date)}</span>
                  </span>
                  <form action={deleteHoliday}>
                    <input type="hidden" name="id" value={h.id} />
                    <button type="submit" className="text-xs font-semibold text-muted hover:text-rejected">
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 pt-5 text-sm text-muted">None added.</p>
          )}
          <ActionForm action={addHoliday} resetOnSuccess className="p-5">
            <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
              <Field label="Name" htmlFor="h_name">
                <input id="h_name" name="name" required className="input" placeholder="Company day" />
              </Field>
              <Field label="Date" htmlFor="h_date">
                <input id="h_date" name="holiday_date" type="date" required className="input" />
              </Field>
              <SubmitButton className="btn btn-secondary">Add</SubmitButton>
            </div>
          </ActionForm>
        </Section>
      </div>
    </>
  );
}
