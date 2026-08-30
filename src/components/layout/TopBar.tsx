"use client";

import { useSession } from "next-auth/react";
import { GenPlusLogo } from "@/components/brand/GenPlusLogo";
import { NotificationBell } from "./NotificationBell";

export function TopBar() {
  const { data: session } = useSession();

  return (
    <header className="lg:hidden fixed top-0 left-0 right-0 z-20 bg-white border-b border-gray-200 flex items-center justify-between px-4 h-14">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-11 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center px-1.5">
          <GenPlusLogo className="w-full h-full" />
        </div>
        <span className="font-bold text-sm text-blue-950">GenPlus Aircond</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <NotificationBell className="w-9 h-9 rounded-full hover:bg-gray-100 transition text-gray-600" />
        <div className="w-8 h-8 rounded-full bg-[#28a89d] flex items-center justify-center">
          <span className="text-white text-xs font-bold">
            {(session?.user?.name)?.[0]?.toUpperCase() ?? "?"}
          </span>
        </div>
      </div>
    </header>
  );
}
