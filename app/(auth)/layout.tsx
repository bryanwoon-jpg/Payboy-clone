export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="hidden flex-col justify-between bg-ink p-10 text-white lg:flex">
        <p className="text-lg font-bold">Payboy Clone</p>
        <div className="max-w-sm">
          <p className="text-3xl font-bold leading-tight">Payroll, leave and claims for Singapore teams.</p>
          <ul className="mt-8 space-y-3 text-[0.9375rem] text-white/75">
            <li>CPF and SDL worked out on every payslip</li>
            <li>Leave balances that follow MOM public holidays</li>
            <li>Receipts in, reimbursed with the next pay run</li>
          </ul>
        </div>
        <p className="text-sm text-white/50">Built on Supabase and Next.js</p>
      </aside>
      <main className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
