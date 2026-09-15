// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Hosting target is switchable with the DEPLOY_TARGET env var at build time:
//   DEPLOY_TARGET=vercel   -> Vercel
//   DEPLOY_TARGET=aws      -> AWS (Amplify / Lambda via node server)
//   unset / anything else  -> Cloudflare (Lovable default)
const DEPLOY_PRESETS: Record<string, string> = {
  vercel: "vercel",
  aws: "aws_lambda",
  amplify: "aws_amplify",
  node: "node-server",
  cloudflare: "cloudflare-module",
};
const preset = DEPLOY_PRESETS[(process.env.DEPLOY_TARGET || "").toLowerCase()] ?? "cloudflare-module";

export default defineConfig({
  nitro: { preset },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
