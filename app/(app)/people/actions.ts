"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fail, num, text, bool } from "@/lib/actions";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { ActionState, AppRole, EmploymentType, ResidencyStatus } from "@/lib/types";

function profileFromForm(formData: FormData) {
  return {
    full_name: text(formData, "full_name") ?? "",
    email: (text(formData, "email") ?? "").toLowerCase(),
    employee_code: text(formData, "employee_code"),
    phone: text(formData, "phone"),
    job_title: text(formData, "job_title"),
    department_id: text(formData, "department_id"),
    manager_id: text(formData, "manager_id"),
    role: (text(formData, "role") ?? "employee") as AppRole,
    employment_type: (text(formData, "employment_type") ?? "full_time") as EmploymentType,
    residency: (text(formData, "residency") ?? "citizen") as ResidencyStatus,
    date_of_birth: text(formData, "date_of_birth"),
    hire_date: text(formData, "hire_date") ?? undefined,
  };
}

export async function createEmployee(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const profile = profileFromForm(formData);
  if (!profile.full_name || !profile.email) return { error: "Name and email are required." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("employees")
    .insert({ ...profile, company_id: session.company.id })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { error: "Someone with that email or employee code already exists." };
    return fail(error);
  }

  const { error: compError } = await supabase.from("employee_compensation").insert({
    employee_id: data.id,
    company_id: session.company.id,
    basic_salary: num(formData, "basic_salary") ?? 0,
    bank_name: text(formData, "bank_name"),
    bank_account_name: text(formData, "bank_account_name"),
    bank_account_no: text(formData, "bank_account_no"),
  });
  if (compError) return fail(compError);

  revalidatePath("/people");
  redirect(`/people/${data.id}?created=1`);
}

export async function updateEmployee(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(formData, "id");
  if (!id) return { error: "Missing employee." };
  const profile = profileFromForm(formData);
  if (!profile.full_name || !profile.email) return { error: "Name and email are required." };
  if (profile.manager_id === id) return { error: "Someone cannot report to themselves." };

  const supabase = await createClient();
  const { error } = await supabase.from("employees").update(profile).eq("id", id);
  if (error) {
    if (error.code === "23505") return { error: "Someone with that email or employee code already exists." };
    return fail(error);
  }
  revalidatePath(`/people/${id}`);
  revalidatePath("/people");
  return { message: "Profile saved." };
}

export async function updateCompensation(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const id = text(formData, "id");
  if (!id) return { error: "Missing employee." };
  const salary = num(formData, "basic_salary");
  if (salary === null || salary < 0) return { error: "Enter a monthly basic salary of 0 or more." };

  const supabase = await createClient();
  const { error } = await supabase.from("employee_compensation").upsert({
    employee_id: id,
    company_id: session.company.id,
    basic_salary: salary,
    bank_name: text(formData, "bank_name"),
    bank_account_name: text(formData, "bank_account_name"),
    bank_account_no: text(formData, "bank_account_no"),
  });
  if (error) return fail(error);
  revalidatePath(`/people/${id}`);
  return { message: "Pay details saved. They apply from the next pay run you calculate." };
}

export async function addPayItem(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const amount = num(formData, "amount");
  const kind = text(formData, "kind") === "deduction" ? "deduction" : "earning";
  if (!id || !name || !amount || amount <= 0) return { error: "Give the item a name and an amount above 0." };

  const supabase = await createClient();
  const { error } = await supabase.from("recurring_pay_items").insert({
    company_id: session.company.id,
    employee_id: id,
    name,
    kind,
    amount,
    cpf_applicable: kind === "earning" ? bool(formData, "cpf_applicable") : false,
  });
  if (error) return fail(error);
  revalidatePath(`/people/${id}`);
  return { message: `${name} added.` };
}

export async function removePayItem(formData: FormData) {
  await requireAdmin();
  const itemId = text(formData, "item_id");
  const employeeId = text(formData, "id");
  if (!itemId) return;
  const supabase = await createClient();
  await supabase.from("recurring_pay_items").delete().eq("id", itemId);
  revalidatePath(`/people/${employeeId}`);
}

export async function saveEntitlements(_: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireAdmin();
  const id = text(formData, "id");
  const year = num(formData, "year");
  if (!id || !year) return { error: "Missing employee or year." };

  const typeIds = formData.getAll("leave_type_id").map(String);
  const rows = typeIds.map((typeId) => ({
    company_id: session.company.id,
    employee_id: id,
    leave_type_id: typeId,
    year,
    entitled: num(formData, `entitled_${typeId}`) ?? 0,
    carried_forward: num(formData, `carried_${typeId}`) ?? 0,
    adjustment: num(formData, `adjustment_${typeId}`) ?? 0,
  }));

  const supabase = await createClient();
  const { error } = await supabase.from("leave_entitlements").upsert(rows, { onConflict: "employee_id,leave_type_id,year" });
  if (error) return fail(error);
  revalidatePath(`/people/${id}`);
  return { message: `Leave entitlements for ${year} saved.` };
}

export async function setTermination(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = text(formData, "id");
  if (!id) return { error: "Missing employee." };
  const date = text(formData, "termination_date");
  const supabase = await createClient();
  const { error } = await supabase
    .from("employees")
    .update({ termination_date: date, status: date ? undefined : "active" })
    .eq("id", id);
  if (error) return fail(error);
  revalidatePath(`/people/${id}`);
  revalidatePath("/people");
  return {
    message: date
      ? "Last day saved. Their final pay run is prorated to this date."
      : "Last day cleared. They are an active employee again.",
  };
}
