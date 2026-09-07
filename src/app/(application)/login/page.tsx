"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { MegtrasLogo } from "@/components/brand/MegtrasLogo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    const result = await signIn("credentials", { email: email.trim().toLowerCase(), password, redirect: false });
    setLoading(false);
    if (result?.error) { setError("Invalid email or password. Please try again."); return; }
    router.push("/app/dashboard"); router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-[#151513] to-[#26251f] px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          {/* White wordmark sits directly on the charcoal panel: brand rule is
              the single-colour mark on coloured grounds, no containing box. */}
          <MegtrasLogo variant="white" title="Megtras" className="h-12 w-auto mb-3" />
          <p className="text-[#F2B705] text-sm font-medium">Job Management System</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-6">Sign In</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="name@megtras.com"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#F2B705] focus:border-transparent transition" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#F2B705] focus:border-transparent transition" />
            </div>
            {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{error}</div>}
            <button type="submit" disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-[#151513] hover:bg-[#26251f] disabled:bg-[#151513]/50 text-white font-medium py-2.5 rounded-lg transition text-sm mt-2">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" />Please wait...</> : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-center text-neutral-500 text-xs mt-6">
          © 2026 Megtras. All rights reserved.
        </p>
      </div>
    </div>
  );
}
