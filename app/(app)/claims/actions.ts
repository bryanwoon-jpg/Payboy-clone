"use server";

import { revalidatePath } from "next/cache";
import { fail, num, text } from "@/lib/actions";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function submitClaim(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const categoryId = text(formData, "category_id");
  const expenseDate = text(formData, "expense_date");
  const amount = num(formData, "amount");
  if (!categoryId || !expenseDate) return { error: "Choose a category and the date of the expense." };
  if (!amount || amount <= 0) return { error: "Enter the amount you paid." };

  const supabase = await createClient();
  const { error } = await supabase.from("claims").insert({
    company_id: session.company.id,
    employee_id: session.employee.id,
    category_id: categoryId,
    expense_date: expenseDate,
    amount: Math.round(amount * 100) / 100,
    merchant: text(formData, "merchant"),
    description: text(formData, "description"),
    receipt_path: text(formData, "receipt_path"),
  });
  if (error) return fail(error);

  revalidatePath("/claims");
  revalidatePath("/dashboard");
  return { message: "Claim submitted for approval." };
}

export async function withdrawClaim(formData: FormData) {
  await requireSession();
  const id = text(formData, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("claims").update({ status: "cancelled" }).eq("id", id);
  revalidatePath("/claims");
}

export async function decideClaim(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireSession();
  const id = text(formData, "id");
  const decision = text(formData, "decision");
  if (!id || (decision !== "approved" && decision !== "rejected")) return { error: "Choose approve or reject." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("claims")
    .update({ status: decision, decision_note: text(formData, "note") })
    .eq("id", id);
  if (error) return fail(error);

  revalidatePath("/approvals/claims");
  return {
    message: decision === "approved" ? "Approved. It will be reimbursed in the next pay run." : "Claim rejected.",
  };
}
