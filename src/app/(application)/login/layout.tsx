import type { Metadata, Viewport } from "next";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest?v=3",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GenPlus Aircond",
    startupImage: "/icons/genplus-app-512-v2.png",
  },
  icons: {
    icon: [
      {
        url: "/icons/genplus-favicon-16-v2.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        url: "/icons/genplus-favicon-32-v2.png",
        sizes: "32x32",
        type: "image/png",
      },
    ],
    shortcut: "/icons/genplus-favicon-32-v2.png",
    apple: "/icons/genplus-apple-touch-v2.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0A857D",
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
