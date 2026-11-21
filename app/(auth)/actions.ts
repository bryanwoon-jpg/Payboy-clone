"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { text } from "@/lib/actions";
import type { ActionState } from "@/lib/types";

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = text(formData, "email");
  const password = text(formData, "password");
  const next = text(formData, "next") ?? "/dashboard";
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function signUp(_: ActionState, formData: FormData): Promise<ActionState> {
  const email = text(formData, "email");
  const password = text(formData, "password");
  if (!email || !password) return { error: "Enter your email and a password." };
  if (password.length < 8) return { error: "Use at least 8 characters for your password." };

  const h = await headers();
  const origin = h.get("origin") ?? `https://${h.get("host")}`;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback?next=/onboarding` },
  });
  if (error) return { error: error.message };

  if (data.session) redirect("/onboarding");
  return { message: `Check ${email} for a confirmation link, then sign in.` };
}
