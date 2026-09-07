"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

export function NotificationBell({
  className = "",
  showLabel = false,
}: {
  className?: string;
  showLabel?: boolean;
}) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch("/api/notifications");
        if (!res.ok) return;
        const data = await res.json() as { unreadCount?: number };
        if (!cancelled) setUnread(data.unreadCount ?? 0);
      } catch { /* ignore */ }
    }

    fetchCount();

    const onFocus = () => fetchCount();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  return (
    <Link href="/app/notifications" className={`relative flex items-center gap-3 ${className}`}>
      <div className="relative shrink-0">
        <Bell className="w-4.5 h-4.5" />
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-3.75 h-3.75 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </div>
      {showLabel && <span>Notifications</span>}
    </Link>
  );
}
