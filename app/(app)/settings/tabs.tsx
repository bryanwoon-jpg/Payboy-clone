import { TabNav } from "@/components/ui";

export function SettingsTabs({ current }: { current: string }) {
  return (
    <TabNav
      current={current}
      tabs={[
        { href: "/settings", label: "Company" },
        { href: "/settings/leave", label: "Leave and holidays" },
        { href: "/settings/claims", label: "Claims" },
      ]}
    />
  );
}
