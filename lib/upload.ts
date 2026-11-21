import { createClient } from "./supabase/client";

/**
 * Uploads a file to the private attachments bucket from the browser.
 * Path: {companyId}/{employeeId}/{folder}/{random}-{name}
 */
export async function uploadAttachment(file: File, companyId: string, employeeId: string, folder: "claims" | "leave") {
  if (file.size > 10 * 1024 * 1024) throw new Error("Files must be 10 MB or smaller.");
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${companyId}/${employeeId}/${folder}/${crypto.randomUUID()}-${safeName}`;
  const supabase = createClient();
  const { error } = await supabase.storage.from("attachments").upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}
