import { Sidebar } from "@/components/sidebar";
import { roleLabels } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();
  const supabase = await createClient();

  let pendingLeave = 0;
  let pendingClaims = 0;
  if (session.isManager) {
    const [leave, claims] = await Promise.all([
      supabase
        .from("leave_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .neq("employee_id", session.employee.id),
      supabase
        .from("claims")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .neq("employee_id", session.employee.id),
    ]);
    pendingLeave = leave.count ?? 0;
    pendingClaims = claims.count ?? 0;
  }

  const groups = [
    {
      label: "Me",
      items: [
        { href: "/dashboard", label: "Overview" },
        { href: "/leave", label: "My leave" },
        { href: "/claims", label: "My claims" },
        { href: "/payslips", label: "My payslips" },
      ],
    },
    ...(session.isManager
      ? [
          {
            label: "Approvals",
            items: [
              { href: "/approvals/leave", label: "Leave requests", badge: pendingLeave },
              { href: "/approvals/claims", label: "Claims", badge: pendingClaims },
            ],
          },
        ]
      : []),
    {
      label: "Company",
      items: [
        { href: "/people", label: "People" },
        { href: "/calendar", label: "Leave calendar" },
        ...(session.isAdmin
          ? [
              { href: "/payroll", label: "Payroll" },
              { href: "/settings", label: "Settings" },
            ]
          : []),
      ],
    },
  ];

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar
        companyName={session.company.name}
        userName={session.employee.full_name}
        roleLabel={roleLabels[session.employee.role]}
        groups={groups}
      />
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8 lg:px-10">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
