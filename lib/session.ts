import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Company, Employee } from "./types";

export type Session = {
  userId: string;
  email: string;
  employee: Employee;
  company: Company;
  isAdmin: boolean;
  isManager: boolean;
};

/** Signed-in user plus their employee record, or null. Cached per request. */
export const getSession = cache(async (): Promise<Session | null | "no-company"> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: employee } = await supabase
    .from("employees")
    .select("*, company:companies(*)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!employee) return "no-company";

  const { company, ...rest } = employee as Employee & { company: Company };
  const { count } = await supabase
    .from("employees")
    .select("id", { count: "exact", head: true })
    .eq("manager_id", rest.id)
    .eq("status", "active");

  const isAdmin = rest.role === "owner" || rest.role === "admin";
  return {
    userId: user.id,
    email: user.email ?? rest.email,
    employee: rest,
    company,
    isAdmin,
    isManager: isAdmin || rest.role === "manager" || (count ?? 0) > 0,
  };
});

/** For pages inside the app shell: always returns a full session. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (session === null) redirect("/login");
  if (session === "no-company") redirect("/onboarding");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (!session.isAdmin) redirect("/dashboard");
  return session;
}
