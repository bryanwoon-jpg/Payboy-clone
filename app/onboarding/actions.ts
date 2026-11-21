"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { bool, fail, text } from "@/lib/actions";
import type { ActionState } from "@/lib/types";

export async function createCompany(_: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_company", {
    p_company_name: text(formData, "company_name") ?? "",
    p_full_name: text(formData, "full_name") ?? "",
    p_uen: text(formData, "uen") ?? undefined,
    p_job_title: text(formData, "job_title") ?? undefined,
  });
  if (error) return fail(error);

  if (bool(formData, "sample")) {
    const { error: sampleError } = await supabase.rpc("load_sample_data");
    if (sampleError) return fail(sampleError);
  }

  redirect("/dashboard");
}
