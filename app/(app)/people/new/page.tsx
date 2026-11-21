import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PageHeader, Section } from "@/components/ui";
import { requireAdmin } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import type { Department } from "@/lib/types";
import { createEmployee } from "../actions";
import { BankFields, EmployeeFields } from "../employee-fields";

export const metadata = { title: "Add employee" };

export default async function NewEmployeePage() {
  const session = await requireAdmin();
  const supabase = await createClient();
  const [{ data: departments }, { data: managers }] = await Promise.all([
    supabase.from("departments").select("id, name").order("name"),
    supabase.from("employees").select("id, full_name").eq("status", "active").order("full_name"),
  ]);

  return (
    <>
      <PageHeader
        title="Add employee"
        description="Once added, they can sign up with their work email and see their own leave, claims and payslips."
        actions={
          <Link href="/people" className="btn btn-secondary">
            Back to people
          </Link>
        }
      />
      <ActionForm action={createEmployee} className="space-y-6">
        <Section title="Profile">
          <EmployeeFields
            departments={(departments ?? []) as Department[]}
            managers={managers ?? []}
            canGrantAdmin={session.employee.role === "owner"}
            employee={{ manager_id: session.employee.id }}
          />
        </Section>
        <Section title="Pay" description="Only HR admins and the employee can see this.">
          <BankFields />
        </Section>
        <div className="flex justify-end">
          <SubmitButton pendingText="Adding…">Add employee</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
