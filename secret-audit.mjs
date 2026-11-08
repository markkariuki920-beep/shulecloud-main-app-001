import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const findings = [];
const add = (label, ok, detail = "") => findings.push({ label, ok: Boolean(ok), detail });
const read = (path) => (existsSync(join(root, path)) ? readFileSync(join(root, path), "utf8") : "");

const gitignore = read(".gitignore");
add(
  "Git ignores local .env files",
  gitignore.includes(".env.*") && gitignore.includes("!.env.example"),
);

const envFiles = [".env", ".env.local", ".env.production", ".env.development"];
const presentEnvFiles = envFiles.filter((file) => existsSync(join(root, file)));
const trackedLocalEnv = presentEnvFiles.filter((file) => file !== ".env.example");
add(
  "No real local environment file is included in this release folder",
  trackedLocalEnv.length === 0,
  trackedLocalEnv.join(", "),
);

const sourceRoots = ["src", "public"];
const sourceFiles = [];
function walk(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(?:[cm]?[jt]sx?|html|json)$/i.test(name)) sourceFiles.push(path);
  }
}
for (const dir of sourceRoots) walk(join(root, dir));

const privateViteName =
  /VITE_[A-Z0-9_]*(?:SERVICE_ROLE|SERVICE_KEY|SECRET|PRIVATE|PASSWORD|TOKEN|ENCRYPTION)[A-Z0-9_]*/;
const badNames = [];
const literalSecret = /sb_secret_[A-Za-z0-9_-]{12,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/;
const literalFindings = [];
for (const file of sourceFiles) {
  const content = readFileSync(file, "utf8");
  if (privateViteName.test(content)) badNames.push(relative(root, file));
  if (literalSecret.test(content)) literalFindings.push(relative(root, file));
}
add(
  "No private credential variable is named with a VITE_ prefix",
  badNames.length === 0,
  badNames.join(", "),
);
add(
  "No recognizable private API key or private-key block is hardcoded in source",
  literalFindings.length === 0,
  literalFindings.join(", "),
);

const envExample = read(".env.example");
const requiredServerOnly = [
  "CLOUD_SERVICE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "INTEGRATIONS_ENCRYPTION_KEY",
  "GOOGLE_DRIVE_CLIENT_SECRET",
  "RESEND_API_KEY",
];
add(
  "Environment template documents server-side secrets",
  requiredServerOnly.every((key) => new RegExp(`^${key}=`, "m").test(envExample)),
);
add(
  "Environment template does not define VITE_ private credentials",
  !envExample
    .split(/\r?\n/)
    .some((line) =>
      /^VITE_.*(?:SERVICE_ROLE|SERVICE_KEY|SECRET|PRIVATE|PASSWORD|TOKEN|ENCRYPTION)/.test(line),
    ),
);

const dist = join(root, "dist");
if (existsSync(dist)) {
  const bundleFiles = [];
  function walkDist(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walkDist(path);
      else if (/\.(?:js|mjs|html|json|css)$/i.test(name)) bundleFiles.push(path);
    }
  }
  walkDist(dist);
  const leaked = bundleFiles.filter((file) => {
    const content = readFileSync(file, "utf8");
    return /sb_secret_[A-Za-z0-9_-]{12,}|service_role\\.[A-Za-z0-9_-]+\\./.test(content);
  });
  add(
    "Built browser assets contain no recognizable privileged key material",
    leaked.length === 0,
    leaked.map((file) => relative(root, file)).join(", "),
  );
} else {
  console.log(
    "WARN Built browser assets secret scan — No dist/ build exists; run after a production build.",
  );
}

for (const result of findings)
  console.log(
    `${result.ok ? "PASS" : "FAIL"} ${result.label}${result.detail ? ` — ${result.detail}` : ""}`,
  );
const failed = findings.filter((result) => !result.ok);
console.log(
  `\nSecret exposure audit: ${findings.length - failed.length}/${findings.length} checks passed.`,
);
if (failed.length) process.exitCode = 1;
