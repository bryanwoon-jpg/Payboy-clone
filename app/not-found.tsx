import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-md px-5 py-24 text-center">
      <h1 className="text-2xl font-bold text-ink">This page does not exist</h1>
      <p className="mt-2 text-muted">It may have been removed, or you may not have access to it.</p>
      <Link href="/dashboard" className="btn btn-primary mt-6">
        Go to overview
      </Link>
    </main>
  );
}
