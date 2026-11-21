import type { ActionState } from "./types";

export function fail(error: unknown): ActionState {
  if (error && typeof error === "object" && "message" in error) {
    return { error: String((error as { message: string }).message) };
  }
  return { error: "Something went wrong. Try again." };
}

export function text(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function num(formData: FormData, key: string) {
  const value = text(formData, key);
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function bool(formData: FormData, key: string) {
  return formData.get(key) === "on" || formData.get(key) === "true";
}
