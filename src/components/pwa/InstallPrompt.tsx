"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Download, X, Share2 } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const INSTALL_PROMPT_BLOCKED_PATHS = ["/terms-and-conditions"];

export function InstallPrompt() {
  const pathname = usePathname();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const isBlockedPath = INSTALL_PROMPT_BLOCKED_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));

  useEffect(() => {
    if (isBlockedPath) return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if (sessionStorage.getItem("pwa-dismissed")) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(navigator as Navigator & { standalone?: boolean }).standalone;
    if (ios) { setIsIOS(true); setShow(true); return; }
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e as BeforeInstallPromptEvent); setShow(true); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, [isBlockedPath]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShow(false);
    setDeferredPrompt(null);
  };

  const handleDismiss = () => { setShow(false); sessionStorage.setItem("pwa-dismissed", "1"); };

  if (isBlockedPath) return null;
  if (!show) return null;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-50 px-4 pb-2 lg:bottom-6 lg:left-6 lg:right-auto lg:max-w-sm lg:px-0 lg:pb-0">
      <div className="bg-blue-950 text-white rounded-2xl shadow-2xl ring-1 ring-white/10 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold text-sm">Install GenPlus Aircond</p>
          <button onClick={handleDismiss} aria-label="Close" className="text-blue-300 hover:text-white transition ml-2 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        {isIOS ? (
          <div className="text-blue-200 text-xs space-y-1">
            <p>Tap <Share2 className="inline w-3.5 h-3.5 mx-0.5 text-white" /> in the browser toolbar, then select
              <span className="text-white font-semibold"> &ldquo;Add to Home Screen&rdquo;</span>.
            </p>
            <p className="text-blue-300">The app will open like a native app — no address bar.</p>
          </div>
        ) : (
          <>
            <p className="text-blue-200 text-xs mb-4">Install this app to your home screen for quick access without a browser.</p>
            <button onClick={handleInstall}
              className="w-full flex items-center justify-center gap-2 bg-white text-blue-950 font-semibold text-sm py-2.5 rounded-xl hover:bg-blue-50 active:bg-blue-100 transition">
              <Download className="w-4 h-4" /> Install Now
            </button>
          </>
        )}
      </div>
    </div>
  );
}
