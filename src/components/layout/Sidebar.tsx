"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { LogOut } from "lucide-react";
import { MegtrasLogo } from "@/components/brand/MegtrasLogo";
import { NotificationBell } from "./NotificationBell";
import { NAV_ITEMS } from "./navConfig";
import { BranchScopeSelector } from "./BranchScopeProvider";
import type { Role } from "@/generated/prisma/client";
import { clearOfflineData, queueSummary } from "@/lib/offline/idb";

function roleBadge(role: Role) {
  const map: Record<Role, string> = {
    SUPERVISOR: "Supervisor",
    MANAGER: "Manager",
    ADMIN: "Admin",
    TECHNICIAN: "Technician",
  };
  return map[role] ?? role;
}

export function Sidebar() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const role = session?.user?.role as Role | undefined;
  const items = role ? NAV_ITEMS[role] : [];

  const displayName = session?.user?.name ?? "—";
  const displayRole = role === "TECHNICIAN" ? "Team" : role ? roleBadge(role) : "";
  const handleSignOut = async () => {
    const queue = await queueSummary();
    if (!navigator.onLine || queue.total > 0) {
      window.alert("Please reconnect and wait for offline changes to finish syncing before signing out.");
      return;
    }
    await clearOfflineData();
    await signOut({ callbackUrl: "/app/login" });
  };

  return (
    <aside
      className="hidden lg:flex flex-col w-64 min-h-screen text-white fixed top-0 left-0 z-30 overflow-hidden border-r border-[#2A2925]"
      style={{
        background:
          "linear-gradient(180deg, #1A1917 0%, #121110 55%, #0D0C0B 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 60% at 50% 0%, rgba(255, 255, 255, 0.045) 0%, transparent 60%), linear-gradient(180deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.28) 100%)",
        }}
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        {/* Logo */}
        <div className="px-4 py-5">
          <div className="flex items-center justify-center rounded-2xl bg-white px-4 py-3.5 shadow-sm">
            <MegtrasLogo className="h-10 w-auto" />
          </div>
          <p className="mt-3 px-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A8375]">
            Job Management
          </p>
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href + "/"));
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? "bg-[#F2B705] text-[#151513] shadow-[0_2px_12px_rgba(242,183,5,0.22)]"
                    : "text-[#C9C3B6] hover:bg-white/[0.06] hover:text-[#F2EFE7]"
                }`}
              >
                <Icon className="w-4.5 h-4.5 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <BranchScopeSelector />

        {/* Footer: user + signout */}
        <div className="border-t border-[#2A2925] px-3 py-4 space-y-1">
          {/* Notification link with unread badge */}
          <NotificationBell
            showLabel
            className="px-3 py-2.5 rounded-xl text-sm font-medium text-[#C9C3B6] hover:bg-white/[0.06] hover:text-[#F2EFE7] transition-colors"
          />

          {/* User info */}
          <div className="px-3 py-2">
            <p className="text-sm font-semibold text-[#F2EFE7] truncate">
              {displayName}
            </p>
            <p className="text-xs font-medium text-[#F2B705]">
              {displayRole}
            </p>
          </div>

          {/* Sign out */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[#C9C3B6] hover:bg-red-600 hover:text-white transition-colors"
          >
            <LogOut className="w-4.5 h-4.5 shrink-0" />
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}
