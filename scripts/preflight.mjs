import fs from "node:fs";
import path from "node:path";

// Reads local config for status only; never logs keys, tokens or URLs.
function readEnv(filename) {
  if (!fs.existsSync(filename)) return null;
  const parsed = {};
  for (const line of fs.readFileSync(filename, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (match) parsed[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
  }
  return parsed;
}

const app = readEnv(".env.local");
const automation = readEnv(".env");
const results = [];
function check(name, ok) {
  results.push(ok);
  console.log((ok ? "PASS " : "FAIL ") + name);
}
function valid(value) {
  return !!value && !/REPLACE_ME|YOUR_|\.{3}|…/i.test(value) && !/[^\x20-\x7E]/.test(value);
}

check("Application environment file exists", !!app);
if (app) {
  const publishable = app.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || "";
  const secret = app.CLERK_SECRET_KEY || "";
  check("Clerk publishable key looks complete", valid(publishable) && /^pk_(test|live)_[A-Za-z0-9_-]+$/.test(publishable));
  check("Clerk secret key looks complete", valid(secret) && /^sk_(test|live)_[A-Za-z0-9_-]+$/.test(secret));
  check("Clerk keys use the same environment", publishable.startsWith("pk_test_") === secret.startsWith("sk_test_"));
  check("Convex app URL is present", /^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(app.NEXT_PUBLIC_CONVEX_URL || ""));
  check("Convex deployment is linked", !!app.CONVEX_DEPLOYMENT);
}
check("Docker environment file exists", !!automation);
if (automation) {
  for (const key of ["N8N_ENCRYPTION_KEY", "LENDLOOP_WEBHOOK_SECRET", "LENDLOOP_CALLBACK_TOKEN"]) {
    check(key + " configured", valid(automation[key]) && automation[key].length >= 32);
  }
  check("Convex HTTP endpoint is present", /^https:\/\/[a-z0-9-]+\.convex\.site$/.test(automation.LENDLOOP_CONVEX_SITE_URL || ""));
  if (app?.NEXT_PUBLIC_CONVEX_SITE_URL) {
    check("App and automation Convex site URLs agree", app.NEXT_PUBLIC_CONVEX_SITE_URL === automation.LENDLOOP_CONVEX_SITE_URL);
  }
}
for (const file of ["01-request-notifications.json", "02-overdue-reminders.json", "03-error-handler.json"]) {
  let ok = false;
  try {
    ok = Array.isArray(JSON.parse(fs.readFileSync(path.join("n8n", "workflows", file), "utf8")).nodes);
  } catch {}
  check("Workflow JSON: " + file, ok);
}
console.log("\n" + results.filter(Boolean).length + "/" + results.length + " local checks passed.");
console.log("This is a formatting check, not proof of successful authentication or n8n delivery.");
if (results.some(ok => !ok)) process.exitCode = 1;
