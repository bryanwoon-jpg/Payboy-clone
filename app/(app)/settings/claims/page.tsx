import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, PageHeader, Section } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { ClaimCategory } from "@/lib/types";
import { saveClaimCategory } from "../actions";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "Claim settings" };

function CategoryFields({ category }: { category?: ClaimCategory }) {
  const key = category?.id ?? "new";
  return (
    <div className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
      {category ? <input type="hidden" name="id" value={category.id} /> : null}
      <Field label="Name" htmlFor={`cname_${key}`}>
        <input id={`cname_${key}`} name="name" required defaultValue={category?.name} className="input" />
      </Field>
      <Field label="Monthly limit (SGD)" htmlFor={`climit_${key}`} hint="Leave blank for no limit">
        <input
          id={`climit_${key}`}
          name="monthly_limit"
          type="number"
          step="0.01"
          min="0"
          defaultValue={category?.monthly_limit ?? ""}
          className="input"
        />
      </Field>
      <div className="flex flex-wrap gap-x-5 gap-y-2 pb-2 text-sm text-ink-soft">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="requires_receipt" defaultChecked={category?.requires_receipt ?? true} className="h-4 w-4 accent-ledger" />
          Receipt required
        </label>
        {category ? (
          <label className="flex items-center gap-2">
            <input type="checkbox" name="active" defaultChecked={category.active} className="h-4 w-4 accent-ledger" />
            In use
          </label>
        ) : null}
      </div>
    </div>
  );
}

export default async function ClaimSettingsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("claim_categories").select("*").order("active", { ascending: false }).order("name");
  const categories = (data ?? []) as ClaimCategory[];

  return (
    <>
      <PageHeader title="Settings" description="What employees can claim for and how much each month." />
      <SettingsTabs current="/settings/claims" />

      <Section title="Claim categories" flush>
        <ul>
          {categories.map((c) => (
            <li key={c.id} className="border-b border-[#e8ecf1] last:border-0">
              <details>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 hover:bg-canvas/60">
                  <span className={`font-semibold ${c.active ? "text-ink" : "text-faint line-through"}`}>{c.name}</span>
                  <span className="text-sm text-muted">
                    {c.monthly_limit ? `Up to ${formatMoney(c.monthly_limit)} a month` : "No monthly limit"}
                    {c.requires_receipt ? ", receipt required" : ""}
                    <span className="ml-3 font-semibold text-ledger">Edit</span>
                  </span>
                </summary>
                <ActionForm action={saveClaimCategory} className="border-t border-rule bg-canvas/40 px-5 py-4">
                  <CategoryFields category={c} />
                  <div className="mt-4 flex justify-end">
                    <SubmitButton>Save {c.name}</SubmitButton>
                  </div>
                </ActionForm>
              </details>
            </li>
          ))}
        </ul>
        <div className="border-t border-rule px-5 py-4">
          <p className="mb-3 text-sm font-semibold text-ink">Add a category</p>
          <ActionForm action={saveClaimCategory} resetOnSuccess>
            <CategoryFields />
            <div className="mt-4 flex justify-end">
              <SubmitButton>Add category</SubmitButton>
            </div>
          </ActionForm>
        </div>
      </Section>
    </>
  );
}
