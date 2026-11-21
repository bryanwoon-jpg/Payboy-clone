import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { getSession } from "@/lib/session";
import { createCompany } from "./actions";

export const metadata = { title: "Set up your company" };

export default async function OnboardingPage() {
  const session = await getSession();
  if (session === null) redirect("/login");
  if (session !== "no-company") redirect("/dashboard");

  return (
    <main className="mx-auto max-w-xl px-5 py-16">
      <p className="text-sm font-semibold text-ledger">Payboy Clone</p>
      <h1 className="mt-2 text-3xl font-bold text-ink">Set up your company</h1>
      <p className="mt-2 text-[0.9375rem] text-muted">
        You will be the owner. We add Singapore leave types, claim categories and MOM public holidays for you, and
        you can change them later in Settings.
      </p>
      <p className="mt-2 text-sm text-muted">
        Expected to join an existing company instead? Ask your HR admin to add you with this email, then sign in
        again.
      </p>

      <ActionForm action={createCompany} className="panel mt-8 space-y-4 p-6">
        <Field label="Company name" htmlFor="company_name">
          <input id="company_name" name="company_name" required className="input" placeholder="Acme Retail Pte Ltd" />
        </Field>
        <Field label="UEN" htmlFor="uen" hint="Optional. Shown on payslips.">
          <input id="uen" name="uen" className="input" placeholder="201912345K" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Your full name" htmlFor="full_name">
            <input id="full_name" name="full_name" required className="input" />
          </Field>
          <Field label="Your job title" htmlFor="job_title">
            <input id="job_title" name="job_title" className="input" placeholder="Managing Director" />
          </Field>
        </div>
        <label className="flex items-start gap-3 rounded-[6px] bg-canvas p-3 text-sm">
          <input type="checkbox" name="sample" defaultChecked className="mt-0.5 h-4 w-4 accent-ledger" />
          <span>
            <span className="font-semibold text-ink">Add six sample employees</span>
            <span className="block text-muted">
              Includes leave requests and claims so you can try approvals and a pay run straight away.
            </span>
          </span>
        </label>
        <SubmitButton className="btn btn-primary w-full" pendingText="Setting up…">
          Create company
        </SubmitButton>
      </ActionForm>
    </main>
  );
}
