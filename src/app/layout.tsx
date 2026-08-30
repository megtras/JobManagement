import type { Metadata, Viewport } from "next";
import { Geist, Inter } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist" });
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-vanguard-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100"
  ),
  title: {
    default: "GenPlus Aircond",
    template: "%s | GenPlus Aircond",
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
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${geist.variable} ${inter.variable} h-full`}>
      <body className="h-full antialiased font-sans">{children}</body>
    </html>
  );
}
