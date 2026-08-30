"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const APPLICATION_ROOTS = new Set([
  "dashboard",
  "customers",
  "appointments",
  "schedule",
  "teams",
  "users",
  "inventory",
  "branches",
  "payments",
  "tasks",
  "notifications",
  "website-leads",
]);

export function AppScopeNavigation() {
  const router = useRouter();

  useEffect(() => {
    function keepApplicationLinksInScope(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (
        !anchor ||
        anchor.target === "_blank" ||
        anchor.hasAttribute("download")
      ) {
        return;
      }

      const url = new URL(anchor.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname.startsWith("/app/")
      ) {
        return;
      }

      const root = url.pathname.split("/")[1];
      if (!APPLICATION_ROOTS.has(root)) return;

      event.preventDefault();
      router.push(`/app${url.pathname}${url.search}${url.hash}`);
    }

    document.addEventListener("click", keepApplicationLinksInScope, true);
    return () =>
      document.removeEventListener("click", keepApplicationLinksInScope, true);
  }, [router]);

  return null;
}
