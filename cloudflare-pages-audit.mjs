import { readFileSync, existsSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const nitro = readFileSync(new URL("../nitro.config.ts", import.meta.url), "utf8");
const docs = readFileSync(new URL("../CLOUDFLARE_PAGES_DEPLOYMENT.md", import.meta.url), "utf8");
const envExample = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
const gitignore = readFileSync(new URL("../.gitignore", import.meta.url), "utf8");
const checks = [
  [
    "Nitro preset is selectable and defaults to portable Node",
    /process\.env\.NITRO_PRESET.*node-server/.test(nitro),
  ],
  [
    "Cloudflare Pages preset is selected conditionally",
    /preset,/.test(nitro) && /preset === ["']cloudflare_pages["']/.test(nitro),
  ],
  [
    "Dedicated Cloudflare build command exists",
    pkg.scripts?.["build:cloudflare"] === "node scripts/build-target.mjs cloudflare",
  ],
  [
    "Portable Node build command exists",
    pkg.scripts?.["build:node"] === "node scripts/build-target.mjs node",
  ],
  [
    "Compatibility date is configured",
    /compatibilityDate:\s*process\.env\.CLOUDFLARE_COMPATIBILITY_DATE/.test(nitro),
  ],
  ["Default build script remains available", typeof pkg.scripts?.build === "string"],
  ["Pages output directory documented as dist", /Build output directory:\s*`?dist`?/i.test(docs)],
  [
    "Cloudflare deployment uses dedicated build target",
    /Build command: `npm run build:cloudflare`/.test(docs),
  ],
  ["Migration path to other hosting is documented", /Moving away from Cloudflare later/.test(docs)],
  [
    "Server-only secrets are documented",
    [
      "CLOUD_SERVICE_KEY",
      "INTEGRATIONS_ENCRYPTION_KEY",
      "SHULECLOUD_CRON_SECRET",
      "GOOGLE_DRIVE_CLIENT_SECRET",
      "RESEND_API_KEY",
    ].every((k) => docs.includes(k)),
  ],
  [
    "Public Supabase variables are documented",
    ["VITE_CLOUD_API_URL", "VITE_CLOUD_PUBLIC_KEY"].every((k) => docs.includes(k)),
  ],
  [
    "Integration credentials remain in-app, not frontend env",
    docs.includes("Enter Daraja and SMS provider credentials through the ShuleCloud Super Admin"),
  ],
  [
    "Local secret files remain ignored",
    [".env", "*.local", ".dev.vars"].some((x) => gitignore.includes(x)),
  ],
  [
    "No private VITE variable added to env template",
    !/^VITE_.*(SERVICE|SECRET|TOKEN|PASSWORD|PRIVATE)/m.test(envExample),
  ],
  [
    "Deployment documentation exists",
    existsSync(new URL("../CLOUDFLARE_PAGES_DEPLOYMENT.md", import.meta.url)),
  ],
];
for (const [label, ok] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
console.log(
  `\nCloudflare Pages configuration audit: ${checks.filter(([, ok]) => ok).length}/${checks.length} checks passed.`,
);
if (checks.some(([, ok]) => !ok)) process.exitCode = 1;
