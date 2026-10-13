import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `pg` is only used when DATABASE_URL points at a real PostgreSQL server.
  // Keep it external so the bundler never tries to inline the driver.
  serverExternalPackages: ["pg"],

  // GitHub Codespaces (and similar reverse proxies) expose the dev server on a
  // `*.app.github.dev` host while forwarding `x-forwarded-host`. Without these
  // entries Next.js treats Server Actions from the preview URL as cross-origin
  // and aborts them ("Invalid Server Actions request").
  allowedDevOrigins: ["*.app.github.dev"],
  experimental: {
    serverActions: {
      // localhost:3000 covers a Codespaces browser tab opened on the forwarded
      // local port; the GitHub tunnel reports `x-forwarded-host` as the public
      // *.app.github.dev host, which otherwise mismatches the Origin.
      allowedOrigins: ["localhost:3000", "*.app.github.dev"],
    },
  },
};

export default nextConfig;