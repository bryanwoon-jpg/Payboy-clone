"use server";

import { revalidatePath } from "next/cache";
import { bool, fail, num, text } from "@/lib/actions";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/types";

export async function updateCompany(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const name = text(formData, "name");
  const payday = num(formData, "payday");
  const workDays = formData.getAll("work_days").map(Number).filter((d) => d >= 1 && d <= 7);
  if (!name) return { error: "Company name is required." };
  if (!payday || payday < 1 || payday > 31) return { error: "Payday must be a day between 1 and 31." };
  if (workDays.length === 0) return { error: "Pick at least one working day." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("companies")
    .update({
      name,
      uen: text(formData, "uen"),
      address: text(formData, "address"),
      industry: text(formData, "industry"),
      payday,
      work_days: workDays.sort(),
    })
    .eq("id", session.company.id);
  if (error) return fail(error);
  revalidatePath("/", "layout");
  return { message: "Company details saved." };
}

export async function addDepartment(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const name = text(formData, "name");
  if (!name) return { error: "Name the department." };
  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({ company_id: session.company.id, name });
  if (error) return error.code === "23505" ? { error: `${name} already exists.` } : fail(error);
  revalidatePath("/settings");
  return { message: `${name} added.` };
}

export async function deleteDepartment(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("departments").delete().eq("id", id);
  revalidatePath("/settings");
}

export async function saveLeaveType(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const code = text(formData, "code")?.toUpperCase();
  if (!name || !code) return { error: "Leave types need a name and a short code." };
  const unlimited = bool(formData, "unlimited");

  const row = {
    company_id: session.company.id,
    name,
    code,
    color: text(formData, "color") ?? "#234E8C",
    default_entitlement: unlimited ? null : (num(formData, "default_entitlement") ?? 0),
    is_paid: bool(formData, "is_paid"),
    requires_attachment: bool(formData, "requires_attachment"),
    allow_half_day: bool(formData, "allow_half_day"),
    carry_forward_limit: num(formData, "carry_forward_limit") ?? 0,
    active: id ? bool(formData, "active") : true,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("leave_types").update(row).eq("id", id)
    : await supabase.from("leave_types").insert(row);
  if (error) return error.code === "23505" ? { error: `The code ${code} is already used.` } : fail(error);
  revalidatePath("/settings/leave");
  return { message: `${name} saved.` };
}

export async function addHoliday(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const name = text(formData, "name");
  const date = text(formData, "holiday_date");
  if (!name || !date) return { error: "Give the holiday a name and date." };
  const supabase = await createClient();
  const { error } = await supabase.from("public_holidays").insert({ company_id: session.company.id, name, holiday_date: date });
  if (error) return fail(error);
  revalidatePath("/settings/leave");
  return { message: `${name} added. It no longer counts as a working day.` };
}

export async function deleteHoliday(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("public_holidays").delete().eq("id", id);
  revalidatePath("/settings/leave");
}

export async function saveClaimCategory(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const id = text(formData, "id");
  const name = text(formData, "name");
  if (!name) return { error: "Name the category." };
  const limit = num(formData, "monthly_limit");

  const row = {
    company_id: session.company.id,
    name,
    monthly_limit: limit && limit > 0 ? limit : null,
    requires_receipt: bool(formData, "requires_receipt"),
    active: id ? bool(formData, "active") : true,
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("claim_categories").update(row).eq("id", id)
    : await supabase.from("claim_categories").insert(row);
  if (error) return error.code === "23505" ? { error: `${name} already exists.` } : fail(error);
  revalidatePath("/settings/claims");
  return { message: `${name} saved.` };
}
