"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, num, text } from "@/lib/actions";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionState, CpfWageType, PayRunStatus } from "@/lib/types";

export async function createPayRun(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const month = text(formData, "month"); // YYYY-MM
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return { error: "Choose a month." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_pay_run", { p_month: `${month}-01` });
  if (error) return fail(error);

  revalidatePath("/payroll");
  redirect(`/payroll/${data}`);
}

export async function recalculatePayRun(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(formData, "id");
  if (!id) return { error: "Missing pay run." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("recalculate_pay_run", { p_run_id: id });
  if (error) return fail(error);
  revalidatePath(`/payroll/${id}`);
  return { message: "Recalculated with the latest salaries, leave and approved claims." };
}

export async function changePayRunStatus(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(formData, "id");
  const status = text(formData, "status") as PayRunStatus | null;
  if (!id || !status) return { error: "Missing pay run." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_pay_run_status", { p_run_id: id, p_status: status });
  if (error) return fail(error);
  revalidatePath(`/payroll/${id}`);
  revalidatePath("/payroll");
  const messages: Record<PayRunStatus, string> = {
    approved: "Approved. Employees can now see their payslips.",
    paid: "Marked as paid. Included claims are now settled.",
    draft: "Moved back to draft. Payslips are hidden from employees until you approve again.",
  };
  return { message: messages[status] };
}

export async function deletePayRun(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("pay_runs").delete().eq("id", id).eq("status", "draft");
  revalidatePath("/payroll");
  redirect("/payroll");
}

export async function addAdjustment(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const runId = text(formData, "id");
  const employeeId = text(formData, "employee_id");
  const label = text(formData, "label");
  const amount = num(formData, "amount");
  const kind = text(formData, "kind") === "deduction" ? "deduction" : "earning";
  const cpfType = (text(formData, "cpf_type") ?? "ow") as CpfWageType;
  if (!runId || !employeeId || !label || !amount || amount <= 0) {
    return { error: "Pick an employee, describe the item and enter an amount above 0." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("pay_run_adjustments").insert({
    company_id: session.company.id,
    pay_run_id: runId,
    employee_id: employeeId,
    label,
    kind,
    amount,
    cpf_type: kind === "earning" ? cpfType : "none",
  });
  if (error) return fail(error);

  const { error: recalcError } = await supabase.rpc("recalculate_pay_run", { p_run_id: runId });
  if (recalcError) return fail(recalcError);
  revalidatePath(`/payroll/${runId}`);
  return { message: `${label} added and payslips recalculated.` };
}

export async function removeAdjustment(formData: FormData) {
  await requireAdmin();
  const runId = text(formData, "id");
  const adjustmentId = text(formData, "adjustment_id");
  if (!runId || !adjustmentId) return;
  const supabase = await createClient();
  await supabase.from("pay_run_adjustments").delete().eq("id", adjustmentId);
  await supabase.rpc("recalculate_pay_run", { p_run_id: runId });
  revalidatePath(`/payroll/${runId}`);
}
