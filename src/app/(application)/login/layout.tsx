import type { Metadata, Viewport } from "next";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

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

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <InstallPrompt />
    </>
  );
}
