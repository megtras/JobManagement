"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { NAV_ITEMS } from "./navConfig";
import type { Role } from "@/generated/prisma/client";
import { clearOfflineData, queueSummary } from "@/lib/offline/idb";

export function BottomNav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const role = session?.user?.role as Role | undefined;
  const allItems = role ? NAV_ITEMS[role] : [];
  const items = allItems.slice(0, 4);
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
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-gray-200 flex pb-[env(safe-area-inset-bottom)]">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
        const Icon = item.icon;
        return (
          <Link key={item.href} href={item.href}
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${active ? "text-blue-600" : "text-gray-500 hover:text-gray-900"}`}>
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium leading-tight">{item.label}</span>
          </Link>
        );
      })}
      <button onClick={handleSignOut}
        className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-gray-500 hover:text-red-600 transition-colors">
        <LogOut className="w-5 h-5" />
        <span className="text-[10px] font-medium leading-tight">Sign Out</span>
      </button>
    </nav>
  );
}
