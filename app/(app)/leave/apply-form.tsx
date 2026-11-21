"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { FormFeedback } from "@/components/action-form";
import { Field } from "@/components/ui";
import { formatDays } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { uploadAttachment } from "@/lib/upload";
import type { ActionState, HalfDay, LeaveType } from "@/lib/types";
import { applyLeave } from "./actions";

export function ApplyLeaveForm({
  leaveTypes,
  companyId,
  employeeId,
  today,
}: {
  leaveTypes: LeaveType[];
  companyId: string;
  employeeId: string;
  today: string;
}) {
  const [state, formAction] = useActionState(applyLeave, undefined);
  const [localError, setLocalError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [typeId, setTypeId] = useState(leaveTypes[0]?.id ?? "");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [halfDay, setHalfDay] = useState<HalfDay>("none");
  const [preview, setPreview] = useState<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const type = leaveTypes.find((t) => t.id === typeId);
  const singleDay = start === end;

  const validRange = Boolean(start && end && end >= start);

  useEffect(() => {
    if (!validRange) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .rpc("preview_leave_days", { p_start: start, p_end: end, p_half_day: singleDay ? halfDay : "none" })
      .then(({ data }) => {
        if (!cancelled) setPreview(typeof data === "number" ? data : data == null ? null : Number(data));
      });
    return () => {
      cancelled = true;
    };
  }, [start, end, halfDay, singleDay, validRange]);

  // Reset the controlled fields once a request has been sent
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    if (state?.message) {
      setStart(today);
      setEnd(today);
      setHalfDay("none");
    }
  }

  useEffect(() => {
    if (state?.message) formRef.current?.reset();
  }, [state]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);
    const formData = new FormData(event.currentTarget);
    const file = formData.get("attachment");
    formData.delete("attachment");
    startTransition(async () => {
      try {
        if (file instanceof File && file.size > 0) {
          formData.set("attachment_path", await uploadAttachment(file, companyId, employeeId, "leave"));
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
      <Field label="Leave type" htmlFor="leave_type_id">
        <select
          id="leave_type_id"
          name="leave_type_id"
          className="input"
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          required
        >
          {leaveTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" htmlFor="start_date">
          <input
            id="start_date"
            name="start_date"
            type="date"
            className="input"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (e.target.value > end) setEnd(e.target.value);
            }}
            required
          />
        </Field>
        <Field label="To" htmlFor="end_date">
          <input
            id="end_date"
            name="end_date"
            type="date"
            className="input"
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
            required
          />
        </Field>
      </div>
      {singleDay && type?.allow_half_day ? (
        <fieldset>
          <legend className="label">Length</legend>
          <div className="flex gap-2">
            {(
              [
                ["none", "Full day"],
                ["am", "Morning"],
                ["pm", "Afternoon"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={`flex-1 cursor-pointer rounded-[6px] border px-3 py-2 text-center text-sm font-semibold ${
                  halfDay === value ? "border-ledger bg-ledger-tint text-ledger" : "border-rule text-ink-soft"
                }`}
              >
                <input
                  type="radio"
                  name="half_day"
                  value={value}
                  checked={halfDay === value}
                  onChange={() => setHalfDay(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <input type="hidden" name="half_day" value="none" />
      )}
      <p className="rounded-[6px] bg-canvas px-3 py-2 text-sm text-ink-soft" aria-live="polite">
        {!validRange || preview === null
          ? "Pick your dates to see how many days this uses."
          : preview === 0
            ? "These dates are rest days or public holidays."
            : `Uses ${formatDays(preview)}. Weekends and public holidays are not counted.`}
      </p>
      <Field label="Reason" htmlFor="reason">
        <textarea id="reason" name="reason" rows={2} className="input" placeholder="Optional" />
      </Field>
      <Field
        label={type?.requires_attachment ? "Supporting document (required)" : "Supporting document"}
        htmlFor="attachment"
        hint="Medical certificate or letter. PDF or image, up to 10 MB."
      >
        <input
          id="attachment"
          name="attachment"
          type="file"
          accept="image/*,application/pdf"
          required={type?.requires_attachment}
          className="block w-full text-sm text-muted file:mr-3 file:rounded-[6px] file:border file:border-rule file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-ink"
        />
      </Field>
      <button type="submit" className="btn btn-primary w-full" disabled={pending}>
        {pending ? "Sending…" : "Send request"}
      </button>
      <FormFeedback state={shownState} />
    </form>
  );
}
