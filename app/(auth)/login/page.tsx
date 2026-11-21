import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field } from "@/components/ui";
import { signIn } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <>
      <h1 className="text-2xl font-bold text-ink">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Use the email your HR admin added you with.</p>
      {error ? (
        <p role="alert" className="mt-4 rounded-[6px] bg-rejected-tint px-3 py-2 text-sm text-rejected">
          {error}
        </p>
      ) : null}
      <ActionForm action={signIn} className="mt-6 space-y-4">
        <input type="hidden" name="next" value={next ?? "/dashboard"} />
        <Field label="Work email" htmlFor="email">
          <input id="email" name="email" type="email" autoComplete="email" required className="input" />
        </Field>
        <Field label="Password" htmlFor="password">
          <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
        </Field>
        <SubmitButton className="btn btn-primary w-full" pendingText="Signing in…">
          Sign in
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-sm text-muted">
        New here?{" "}
        <Link href="/signup" className="link">
          Create an account
        </Link>
      </p>
    </>
  );
}
