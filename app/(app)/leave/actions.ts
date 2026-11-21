"use server";

import { revalidatePath } from "next/cache";
import { fail, text } from "@/lib/actions";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionState, HalfDay } from "@/lib/types";

export async function applyLeave(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const supabase = await createClient();

  const leaveTypeId = text(formData, "leave_type_id");
  const start = text(formData, "start_date");
  const end = text(formData, "end_date") ?? start;
  const halfDay = (text(formData, "half_day") ?? "none") as HalfDay;
  if (!leaveTypeId || !start || !end) return { error: "Choose a leave type and dates." };
  if (end < start) return { error: "The end date is before the start date." };

  const { error } = await supabase.from("leave_requests").insert({
    company_id: session.company.id,
    employee_id: session.employee.id,
    leave_type_id: leaveTypeId,
    start_date: start,
    end_date: end,
    half_day: start === end ? halfDay : "none",
    reason: text(formData, "reason"),
    attachment_path: text(formData, "attachment_path"),
  });
  if (error) return fail(error);

  revalidatePath("/leave");
  revalidatePath("/dashboard");
  return { message: "Leave request sent to your manager." };
}

export async function cancelLeave(formData: FormData) {
  await requireSession();
  const id = text(formData, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("leave_requests").update({ status: "cancelled" }).eq("id", id);
  revalidatePath("/leave");
  revalidatePath("/dashboard");
}

export async function decideLeave(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  const id = text(formData, "id");
  const decision = text(formData, "decision");
  if (!id || (decision !== "approved" && decision !== "rejected")) return { error: "Choose approve or reject." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ status: decision, decision_note: text(formData, "note") })
    .eq("id", id);
  if (error) return fail(error);

  revalidatePath("/approvals/leave");
  revalidatePath("/calendar");
  return { message: decision === "approved" ? "Leave approved." : "Leave rejected." };
}
