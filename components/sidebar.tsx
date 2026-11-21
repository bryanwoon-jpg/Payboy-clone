"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = { href: string; label: string; badge?: number };

export function Sidebar({
  companyName,
  userName,
  roleLabel,
  groups,
}: {
  companyName: string;
  userName: string;
  roleLabel: string;
  groups: { label: string; items: NavItem[] }[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const nav = (
    <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="px-3 pb-1.5 text-xs font-semibold text-white/45">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center justify-between rounded-[6px] px-3 py-2 text-[0.9375rem] ${
                      active ? "bg-white/12 font-semibold text-white" : "text-white/75 hover:bg-white/6 hover:text-white"
                    }`}
                  >
                    {item.label}
                    {item.badge ? (
                      <span className="rounded-full bg-[#f2c14e] px-2 text-xs font-bold text-ink">{item.badge}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const footer = (
    <div className="border-t border-white/10 px-5 py-4">
      <p className="truncate text-sm font-semibold text-white">{userName}</p>
      <p className="text-xs text-white/55">{roleLabel}</p>
      <form action="/auth/signout" method="post" className="mt-3">
        <button type="submit" className="text-sm font-semibold text-white/75 hover:text-white">
          Sign out
        </button>
      </form>
    </div>
  );

  return (
    <>
      <header className="no-print sticky top-0 z-30 flex items-center justify-between bg-ink px-4 py-3 text-white lg:hidden">
        <p className="truncate font-bold">{companyName}</p>
        <button
          type="button"
          className="rounded-[6px] border border-white/25 px-3 py-1.5 text-sm font-semibold"
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Close" : "Menu"}
        </button>
      </header>
      {open ? (
        <div id="mobile-nav" className="no-print fixed inset-0 top-[52px] z-20 flex flex-col bg-ink lg:hidden">
          {nav}
          {footer}
        </div>
      ) : null}
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-ink lg:flex">
        <div className="border-b border-white/10 px-5 py-5">
          <p className="text-xs font-semibold text-white/45">Payboy Clone</p>
          <p className="mt-0.5 truncate font-bold text-white">{companyName}</p>
        </div>
        {nav}
        {footer}
      </aside>
    </>
  );
}
