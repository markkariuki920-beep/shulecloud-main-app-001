import { defineConfig } from "nitro";

/**
 * Hosting-provider-neutral Nitro configuration.
 *
 * Default to a standard Node server build so local builds and generic Node
 * hosts do not inherit Cloudflare-specific output. Select a provider preset
 * only for that deployment, e.g. NITRO_PRESET=cloudflare_pages.
 */
const preset = process.env.NITRO_PRESET?.trim() || "node-server";

export default defineConfig({
  preset,
  ...(preset === "cloudflare_pages"
    ? { compatibilityDate: process.env.CLOUDFLARE_COMPATIBILITY_DATE || "2026-10-30" }
    : {}),
});
