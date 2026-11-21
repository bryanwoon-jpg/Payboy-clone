"use client";

import { useActionState, useState } from "react";
import { FormFeedback, SubmitButton } from "@/components/action-form";
import type { ActionState } from "@/lib/types";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

export function DecisionForm({ id, action }: { id: string; action: Action }) {
  const [state, formAction] = useActionState(action, undefined);
  const [showNote, setShowNote] = useState(false);

  if (state?.message) {
    return <FormFeedback state={state} />;
  }

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="id" value={id} />
      {showNote ? (
        <textarea
          name="note"
          rows={2}
          className="input w-56"
          placeholder="Note for the employee (optional)"
          aria-label="Note for the employee"
        />
      ) : (
        <button type="button" className="text-xs font-semibold text-muted hover:text-ink" onClick={() => setShowNote(true)}>
          Add a note
        </button>
      )}
      <div className="flex gap-2">
        <SubmitButton className="btn btn-danger btn-sm" name="decision" value="rejected" pendingText="Saving…">
          Reject
        </SubmitButton>
        <SubmitButton className="btn btn-approve btn-sm" name="decision" value="approved" pendingText="Saving…">
          Approve
        </SubmitButton>
      </div>
      <FormFeedback state={state} />
    </form>
  );
}
