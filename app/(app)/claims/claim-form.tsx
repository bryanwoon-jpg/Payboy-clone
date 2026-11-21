"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { FormFeedback } from "@/components/action-form";
import { Field } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { uploadAttachment } from "@/lib/upload";
import type { ActionState, ClaimCategory } from "@/lib/types";
import { submitClaim } from "./actions";

export function ClaimForm({
  categories,
  companyId,
  employeeId,
  today,
}: {
  categories: ClaimCategory[];
  companyId: string;
  employeeId: string;
  today: string;
}) {
  const [state, formAction] = useActionState(submitClaim, undefined);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const formRef = useRef<HTMLFormElement>(null);
  const category = categories.find((c) => c.id === categoryId);

  useEffect(() => {
    if (state?.message) formRef.current?.reset();
  }, [state]);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    const formData = new FormData(event.currentTarget);
    const file = formData.get("receipt");
    formData.delete("receipt");
    startTransition(async () => {
      try {
        if (file instanceof File && file.size > 0) {
          formData.set("receipt_path", await uploadAttachment(file, companyId, employeeId, "claims"));
        }
        startTransition(() => formAction(formData));
      } catch (e) {
        setLocalError(e instanceof Error ? e.message : "Upload failed.");
      }
    });
  }

  const shownState: ActionState = localError ? { error: localError } : state;

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      <Field
        label="Category"
        htmlFor="category_id"
        hint={category?.monthly_limit ? `Up to ${formatMoney(category.monthly_limit)} a month` : undefined}
      >
        <select
          id="category_id"
          name="category_id"
          className="input"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date of expense" htmlFor="expense_date">
          <input id="expense_date" name="expense_date" type="date" max={today} defaultValue={today} className="input" required />
        </Field>
        <Field label="Amount (SGD)" htmlFor="amount">
          <input id="amount" name="amount" type="number" min="0.01" step="0.01" inputMode="decimal" className="input" required />
        </Field>
      </div>
      <Field label="Paid to" htmlFor="merchant">
        <input id="merchant" name="merchant" className="input" placeholder="Grab, Kopitiam, Challenger…" />
      </Field>
      <Field label="What was it for?" htmlFor="description">
        <textarea id="description" name="description" rows={2} className="input" />
      </Field>
      <Field
        label={category?.requires_receipt ? "Receipt (required)" : "Receipt"}
        htmlFor="receipt"
        hint="Photo or PDF, up to 10 MB."
      >
        <input
          id="receipt"
          name="receipt"
          type="file"
          accept="image/*,application/pdf"
          required={category?.requires_receipt}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-[6px] file:border file:border-rule file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink"
        />
      </Field>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Submitting…" : "Submit claim"}
      </button>
      <FormFeedback state={shownState} />
    </form>
  );
}
