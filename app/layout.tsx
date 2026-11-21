import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (from @fontsource-variable) so builds never depend on Google Fonts
const schibsted = localFont({
  src: [
    {
      path: "../node_modules/@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-wght-normal.woff2",
      weight: "400 900",
      style: "normal",
    },
    {
      path: "../node_modules/@fontsource-variable/schibsted-grotesk/files/schibsted-grotesk-latin-ext-wght-normal.woff2",
      weight: "400 900",
      style: "normal",
    },
  ],
  variable: "--font-schibsted",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Payboy Clone",
    template: "%s | Payboy Clone",
  },
  description: "Payroll, leave and claims for Singapore teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${schibsted.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
