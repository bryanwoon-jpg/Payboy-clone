import type { AppRole, EmploymentType, ResidencyStatus } from "./types";

const money = new Intl.NumberFormat("en-SG", {
  style: "currency",
  currency: "SGD",
  minimumFractionDigits: 2,
});

export function formatMoney(value: number | string | null | undefined) {
  return money.format(Number(value ?? 0));
}

function parseDate(value: string) {
  // Dates from Postgres arrive as YYYY-MM-DD; treat them as local calendar dates
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return parseDate(value).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" });
}

export function formatShortDate(value: string | null | undefined) {
  if (!value) return "";
  return parseDate(value).toLocaleDateString("en-SG", { day: "numeric", month: "short" });
}

export function formatMonth(value: string) {
  return parseDate(value).toLocaleDateString("en-SG", { month: "long", year: "numeric" });
}

export function formatDateRange(start: string, end: string) {
  return start === end ? formatDate(start) : `${formatShortDate(start)} to ${formatDate(end)}`;
}

export function formatDays(days: number | string) {
  const n = Number(days);
  return `${n % 1 === 0 ? n.toFixed(0) : n.toFixed(1)} day${n === 1 ? "" : "s"}`;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export const roleLabels: Record<AppRole, string> = {
  owner: "Owner",
  admin: "HR admin",
  manager: "Manager",
  employee: "Employee",
};

export const residencyLabels: Record<ResidencyStatus, string> = {
  citizen: "Singapore citizen",
  pr: "PR (3rd year onwards)",
  pr_1: "PR (1st year)",
  pr_2: "PR (2nd year)",
  foreigner: "Foreigner (no CPF)",
};

export const employmentLabels: Record<EmploymentType, string> = {
  full_time: "Full time",
  part_time: "Part time",
  contract: "Contract",
  intern: "Intern",
};

export function todayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}
