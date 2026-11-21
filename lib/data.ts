import "server-only";
import { createClient } from "./supabase/server";
import type { Employee } from "./types";

export async function getEmployeeDirectory() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, full_name, job_title, department_id, manager_id, role, status, email, employee_code")
    .order("full_name");
  const list = (data ?? []) as Pick<
    Employee,
    "id" | "full_name" | "job_title" | "department_id" | "manager_id" | "role" | "status" | "email" | "employee_code"
  >[];
  const byId = new Map(list.map((e) => [e.id, e]));
  return { list, byId };
}

/** Signed URLs for private attachments, keyed by storage path */
export async function signAttachments(paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  if (unique.length === 0) return new Map<string, string>();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("attachments").createSignedUrls(unique, 60 * 30);
  const map = new Map<string, string>();
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  }
  return map;
}
