import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const target = process.argv[2];
const presets = {
  cloudflare: "cloudflare_pages",
  node: "node-server",
};

if (!target || !(target in presets)) {
  console.error("Usage: node scripts/build-target.mjs <cloudflare|node>");
  process.exit(2);
}

process.env.NITRO_PRESET = presets[target];
const viteCli = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const result = spawnSync(process.execPath, [viteCli, "build"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
