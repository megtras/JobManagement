import type { Metadata } from "next";
import { SessionProvider } from "@/components/providers/SessionProvider";
import { DevSwCleanup } from "@/components/pwa/DevSwCleanup";
import { AppScopeNavigation } from "@/components/pwa/AppScopeNavigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Megtras System",
  description: "Megtras job management system.",
  applicationName: "Megtras",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ApplicationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  return (
    <SessionProvider session={session}>
      <AppScopeNavigation />
      {children}
      <DevSwCleanup />
    </SessionProvider>
  );
}
