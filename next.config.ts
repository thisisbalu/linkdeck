import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function config(phase: string): NextConfig {
  return {
    // The service builds into .next-builds/<id> (NEXT_DIST_DIR) so a running
    // app is never touched by a build; `next dev` uses its own folder too.
    distDir: process.env.NEXT_DIST_DIR || (phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"),

    async rewrites() {
      return {
        // Favicons live in the data folder (possibly a synced cloud folder),
        // so always serve them through a route that reads them from there.
        beforeFiles: [{ source: "/favicons/:file", destination: "/api/favicons/:file" }],
      };
    },

    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            // Only Linkdeck itself and the Chrome extension's new-tab page may embed it.
            { key: "Content-Security-Policy", value: "frame-ancestors 'self' chrome-extension:" },
          ],
        },
      ];
    },
  };
}
