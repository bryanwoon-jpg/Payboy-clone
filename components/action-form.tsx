"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/types";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Form wired to a server action that returns { error } or { message }.
 * Shows the result inline and optionally clears the form after success.
 */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
  onSuccess,
}: {
  action: Action;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.message && !state.error) {
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.();
    }
  }, [state, resetOnSuccess, onSuccess]);

  return (
    <form ref={formRef} action={formAction} className={className}>
      {children}
      <FormFeedback state={state} />
    </form>
  );
}

export function FormFeedback({ state }: { state: ActionState }) {
  if (!state?.error && !state?.message) return null;
  return (
    <p
      role={state.error ? "alert" : "status"}
      className={`mt-3 rounded-[6px] px-3 py-2 text-sm ${
        state.error ? "bg-rejected-tint text-rejected" : "bg-approved-tint text-approved"
      }`}
    >
      {state.error ?? state.message}
    </p>
  );
}

export function SubmitButton({
  children,
  pendingText,
  className = "btn btn-primary",
  name,
  value,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? (pendingText ?? "Saving…") : children}
    </button>
  );
}
