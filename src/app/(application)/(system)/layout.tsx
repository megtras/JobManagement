import { getServerSession } from "next-auth";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { BottomNav } from "@/components/layout/BottomNav";
import { BranchScopeProvider } from "@/components/layout/BranchScopeProvider";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { OfflineSyncStatus } from "@/components/pwa/OfflineSyncStatus";
import { LocationTracker } from "@/components/tracking/LocationTracker";
import { authOptions } from "@/lib/auth";
import { getBranches } from "@/lib/actions/users";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest?v=3",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Megtras",
    startupImage: "/icons/icon-512.png",
  },
  icons: {
    icon: [
      {
        url: "/icons/favicon-16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/icons/favicon-32.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    shortcut: "/icons/favicon-32.png",
    apple: "/icons/icon-180.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#151513",
};

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const isSupervisor = session?.user.role === "SUPERVISOR";
  const branches = isSupervisor ? await getBranches() : [];

  return (
    <BranchScopeProvider branches={branches} isSupervisor={isSupervisor}>
      <div className="h-[100dvh] overflow-hidden bg-gray-50 lg:min-h-screen lg:h-auto lg:overflow-visible">
        {/* Desktop sidebar */}
        <Sidebar />

        {/* Mobile top bar */}
        <TopBar />

        {/* Main content - offset for sidebar on desktop, top/bottom bar on mobile */}
        <main className="h-full overflow-y-auto lg:ml-64 pt-14 lg:pt-0 pb-[calc(4rem+env(safe-area-inset-bottom))] lg:pb-0 lg:min-h-screen lg:h-auto lg:overflow-visible">
          <div className="p-4 md:p-6 lg:p-8">
            <OfflineSyncStatus enabled={session?.user.role === "TECHNICIAN"} />
            {children}
          </div>
        </main>

        {/* Mobile bottom nav */}
        <BottomNav />

        {/* PWA install prompt - shown once per session if not installed */}
        <InstallPrompt />

        <LocationTracker userId={session?.user.id ?? null} />
      </div>
    </BranchScopeProvider>
  );
}
