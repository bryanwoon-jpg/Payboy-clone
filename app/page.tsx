import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  if (session === null) redirect("/login");
  if (session === "no-company") redirect("/onboarding");
  redirect("/dashboard");
}
