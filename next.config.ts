import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

initOpenNextCloudflareForDev();

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep build tracing inside this independent project even when Documents has
  // another package-lock.json in a parent folder.
  outputFileTracingRoot: process.cwd(),
  // Turbopack's WASM loader uses a dynamic path that otherwise traces Prisma
  // CLI/dev engines and unrelated Next tooling into every Worker deployment.
  outputFileTracingExcludes: {
    "/*": [
      "node_modules/prisma/**",
      "node_modules/@prisma/dev/**",
      "node_modules/@electric-sql/**",
      "node_modules/blake3-wasm/**",
      "node_modules/source-map/**",
      "node_modules/next/dist/compiled/source-map08/**",
      "node_modules/next/dist/compiled/@mswjs/interceptors/**",
      "node_modules/next/dist/compiled/@vercel/og/**",
    ],
  },
  devIndicators: {
    position: "bottom-right",
  },
  // OpenNext patches Turbopack's emitted WASM modules for the Workers runtime.
  turbopack: {},
  // Local development remains on Webpack because @serwist/next does not yet
  // support Turbopack. Prisma's query compiler needs async WASM in that path.
  webpack(config, { isServer }) {
    if (isServer) {
      config.experiments = { ...config.experiments, asyncWebAssembly: true };
      config.module.rules.push({ test: /\.wasm$/, type: "webassembly/async" });
    }
    return config;
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
