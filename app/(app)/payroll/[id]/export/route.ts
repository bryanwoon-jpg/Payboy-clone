import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

function csv(rows: (string | number | null | undefined)[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell == null ? "" : String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}

const money = (n: number | string) => Number(n).toFixed(2);

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || session === "no-company" || !session.isAdmin) {
    return new NextResponse("Not allowed", { status: 403 });
  }
  const { id } = await params;
  const type = request.nextUrl.searchParams.get("type") === "cpf" ? "cpf" : "bank";
  const supabase = await createClient();

  const { data: run } = await supabase.from("pay_runs").select("*").eq("id", id).maybeSingle();
  if (!run) return new NextResponse("Not found", { status: 404 });

  const { data: slips } = await supabase
    .from("payslips")
    .select("*, employee:employees(full_name, employee_code, residency, date_of_birth)")
    .eq("pay_run_id", id);

  type Row = {
    employee_id: string;
    net_pay: number;
    ordinary_wages: number;
    additional_wages: number;
    employee_cpf: number;
    employer_cpf: number;
    sdl: number;
    gross_pay: number;
    cpf_age: number | null;
    employee: { full_name: string; employee_code: string | null; residency: string };
  };
  const rows = ((slips ?? []) as Row[]).sort((a, b) => a.employee.full_name.localeCompare(b.employee.full_name));
  const period = String(run.period_start).slice(0, 7);
  let body: string;

  if (type === "bank") {
    const { data: comp } = await supabase
      .from("employee_compensation")
      .select("employee_id, bank_name, bank_account_name, bank_account_no")
      .in(
        "employee_id",
        rows.map((r) => r.employee_id),
      );
    const bank = new Map((comp ?? []).map((c) => [c.employee_id, c]));
    body = csv([
      ["Employee ID", "Employee name", "Bank", "Account name", "Account number", "Amount (SGD)", "Payment date", "Reference"],
      ...rows.map((r) => {
        const b = bank.get(r.employee_id);
        return [
          r.employee.employee_code,
          r.employee.full_name,
          b?.bank_name,
          b?.bank_account_name ?? r.employee.full_name,
          b?.bank_account_no,
          money(r.net_pay),
          run.pay_date,
          `SALARY ${period}`,
        ];
      }),
    ]);
  } else {
    body = csv([
      ["Employee ID", "Employee name", "Residency", "CPF age", "Ordinary wages", "Additional wages", "Employee CPF", "Employer CPF", "Total CPF", "SDL", "Total wages"],
      ...rows.map((r) => [
        r.employee.employee_code,
        r.employee.full_name,
        r.employee.residency,
        r.cpf_age,
        money(r.ordinary_wages),
        money(r.additional_wages),
        money(r.employee_cpf),
        money(r.employer_cpf),
        money(Number(r.employee_cpf) + Number(r.employer_cpf)),
        money(r.sdl),
        money(r.gross_pay),
      ]),
      [],
      ["", "Totals", "", "", "", "", money(run.total_employee_cpf), money(run.total_employer_cpf), money(Number(run.total_employee_cpf) + Number(run.total_employer_cpf)), money(run.total_sdl), money(run.total_gross)],
    ]);
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${type === "bank" ? "bank-file" : "cpf-summary"}-${period}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
