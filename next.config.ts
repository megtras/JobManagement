import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep build tracing inside this independent project even when Documents has
  // another package-lock.json in a parent folder.
  outputFileTracingRoot: process.cwd(),
  devIndicators: {
    position: "bottom-right",
  },
  async headers() {
    return [
      {
        source: "/uploads/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/api/uploads/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
  async redirects() {
    const applicationRoutes = [
      "login",
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
    ];

    return applicationRoutes.map((route) => ({
      source: `/${route}/:path*`,
      destination: `/app/${route}/:path*`,
      permanent: false,
    }));
  },
  async rewrites() {
    return [
      { source: "/app", destination: "/dashboard" },
      { source: "/app/:path*", destination: "/:path*" },
    ];
  },
};

const isDev = process.env.NODE_ENV === "development";

export default isDev
  ? nextConfig
  : withSerwistInit({
      swSrc: "src/sw.ts",
      swDest: "public/sw.js",
      scope: "/app/",
      reloadOnOnline: false,
      exclude: [/^uploads[\\/]/, /uploads[\\/]/],
    })(nextConfig);
