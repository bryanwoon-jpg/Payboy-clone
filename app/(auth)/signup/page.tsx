import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { signUp } from "../actions";

export const metadata = { title: "Create an account" };

export default function SignupPage() {
  return (
    <>
      <h1 className="text-2xl font-bold text-ink">Create an account</h1>
      <p className="mt-1 text-sm text-muted">
        Setting up your company? Sign up, then add your team. Joining a company? Sign up with the email HR used and
        you will land in your company automatically.
      </p>
      <ActionForm action={signUp} className="mt-6 space-y-4">
        <Field label="Work email" htmlFor="email">
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters">
          <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required className="input" />
        </Field>
        <SubmitButton className="btn btn-primary w-full" pendingText="Creating account…">
          Create account
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="link">
          Sign in
        </Link>
      </p>
    </>
  );
}
