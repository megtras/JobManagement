import Link from "next/link";
import { ArrowLeft, LayoutDashboard, ClipboardList } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-[70vh] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-blue-600">404</p>
        <h1 className="mt-2 text-xl font-bold text-gray-900">Page not found</h1>
        <p className="mt-2 text-sm text-gray-500">
          This link is no longer available or the file could not be opened.
        </p>
        <div className="mt-6 grid gap-2">
          <Link
            href="/tasks"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#151513] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#26251f]"
          >
            <ClipboardList className="h-4 w-4" />
            Team Tasks
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-500 transition hover:text-gray-800"
          >
            <ArrowLeft className="h-4 w-4" />
            Home
          </Link>
        </div>
      </div>
    </main>
  );
}
