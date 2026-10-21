#!/usr/bin/env node
/**
 * Makes the Ledgerly Vercel project reachable by the public and reports the
 * shareable production link.
 *
 * Usage:
 *   VERCEL_TOKEN=<token> node scripts/vercel-open-up.mjs
 *
 * Optional environment variables:
 *   VERCEL_PROJECT   project name or id                (default: finance)
 *   VERCEL_TEAM_ID   team id, for scoped projects
 *   PROTECTION_SCOPE preview | all | off                (default: preview)
 *   DATABASE_URL     Postgres URL; sets the env var and redeploys production
 *
 * "preview"  -> previews stay locked behind Vercel login, production is public
 * "all"      -> Vercel login required everywhere
 * "off"      -> no Vercel protection at all
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://api.vercel.com";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function readSecretFile(name) {
  try {
    const value = readFileSync(join(repoRoot, ".data", name), "utf8").trim();
    return value || undefined;
  } catch {
    return undefined;
  }
}

const token = process.env.VERCEL_TOKEN ?? readSecretFile("vercel-token");
const projectName = process.env.VERCEL_PROJECT ?? "finance";
const scope = (process.env.PROTECTION_SCOPE ?? "preview").toLowerCase();
const teamId = process.env.VERCEL_TEAM_ID;
const databaseUrl = process.env.DATABASE_URL ?? readSecretFile("vercel-db-url");

if (!token) {
  console.error("Missing Vercel token. Set VERCEL_TOKEN, or save it to .data/vercel-token");
  console.error("Create one at https://vercel.com/account/tokens");
  process.exit(1);
}

const teamQuery = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const detail = payload?.error?.message ?? payload?.message ?? text;
    throw new Error(`${method} ${path} -> ${response.status}: ${detail}`);
  }
  return payload;
}

function productionDomains(project) {
  const domains = new Set();
  for (const alias of project.alias ?? []) {
    if (alias.environment === "production" || alias.target === "PRODUCTION") {
      if (alias.domain) domains.add(alias.domain);
    }
  }
  for (const domain of project.domains ?? []) {
    if (domain.environment === "production") domains.add(domain.name);
  }
  for (const deployment of project.latestDeployments ?? []) {
    if (deployment.target === "production" && deployment.url) {
      domains.add(new URL(deployment.url).host);
    }
  }
  return [...domains];
}

function describeProtection(project) {
  const sso = project.ssoProtection;
  const password = project.passwordProtection;
  const trusted = project.trustedIps;
  const passport = project.passport;

  if (sso) console.log(`  Vercel Authentication : ON  (${sso.deploymentType})`);
  else console.log("  Vercel Authentication : off");
  if (password) console.log(`  Password Protection   : ON  (${password.deploymentType})`);
  else console.log("  Password Protection   : off");
  if (trusted) console.log(`  Trusted IPs           : ON  (${trusted.deploymentType})`);
  if (passport) console.log(`  Passport              : ON  (${passport.deploymentType})`);
}

async function findProject() {
  const list = await api(`/v10/projects${teamQuery}?limit=100`);
  const projects = Array.isArray(list) ? list : (list.projects ?? []);
  const match =
    projects.find((p) => p.name === projectName) ??
    projects.find((p) => p.id === projectName) ??
    projects.find((p) => p.link?.repo === "Shahil-Darksoul/finance");

  if (!match) {
    console.error(`No project named "${projectName}". Available: ${projects.map((p) => p.name).join(", ") || "(none)"}`);
    process.exit(1);
  }
  return match;
}

async function main() {
  const user = await api("/v2/user");
  console.log(`Authenticated as ${user.user?.username ?? user.user?.email ?? "unknown"}`);

  const found = await findProject();
  const id = found.id;
  const query = teamId ? `?teamId=${encodeURIComponent(teamId)}` : "";

  const before = await api(`/v9/projects/${encodeURIComponent(id)}${query}`);
  console.log(`\nProject "${before.name}" (${id})`);
  console.log("Current protection:");
  describeProtection(before);

  const patch = {};
  if (scope === "off") {
    patch.ssoProtection = null;
    patch.passwordProtection = null;
  } else if (scope === "preview" || scope === "all") {
    patch.ssoProtection = { deploymentType: scope };
    patch.passwordProtection = null;
  } else {
    console.error(`Unknown PROTECTION_SCOPE "${scope}". Use preview, all or off.`);
    process.exit(1);
  }

  const trusted = before.trustedIps;
  const passport = before.passport;
  if (trusted && ["all", "production", "prod_deployment_urls_and_all_previews"].includes(trusted.deploymentType)) {
    patch.trustedIps = null;
    console.log(`\nDisabling Trusted IPs (${trusted.deploymentType}) — it also gates production.`);
  }
  if (passport && ["all", "production", "prod_deployment_urls_and_all_previews"].includes(passport.deploymentType)) {
    patch.passport = null;
    console.log("Disabling Passport — it also gates production.");
  }

  const after = await api(`/v9/projects/${encodeURIComponent(id)}${query}`, {
    method: "PATCH",
    body: patch,
  });
  console.log("\nUpdated protection:");
  describeProtection(after);

  const envList = await api(`/v10/projects/${encodeURIComponent(id)}/env${query}`);
  const envs = Array.isArray(envList) ? envList : (envList.envs ?? []);
  const keys = envs.map((e) => e.key);
  console.log(`\nEnv vars set on the project: ${keys.length ? keys.join(", ") : "(none)"}`);

  if (databaseUrl) {
    const created = await api(`/v10/projects/${encodeURIComponent(id)}/env${query}`, {
      method: "POST",
      body: {
        key: "DATABASE_URL",
        value: databaseUrl,
        type: "encrypted",
        target: ["production", "preview"],
      },
    });
    console.log(`\nSet DATABASE_URL (${created?.key ?? "DATABASE_URL"}), redeploying production...`);

    const deployments = await api(`/v7/deployments?projectId=${encodeURIComponent(id)}&limit=10${teamId ? `&teamId=${encodeURIComponent(teamId)}` : ""}`);
    const list = Array.isArray(deployments) ? deployments : (deployments.deployments ?? []);
    const production = list.find((d) => d.target === "production" && d.readyState === "READY");
    if (production) {
      const redeploy = await api("/v13/deployments", {
        method: "POST",
        body: { name: before.name, deploymentId: production.id, target: "production" },
      });
      console.log(`Redeploy started: ${redeploy.url ?? redeploy.id}`);
    } else {
      console.log("No ready production deployment found — trigger a redeploy from the dashboard.");
    }
  } else if (!keys.includes("DATABASE_URL")) {
    console.log("\nWARNING: DATABASE_URL is not set on the project.");
    console.log("         The app falls back to SQLite, which cannot be written on Vercel.");
    console.log("         Sign-up will fail with a 500 until a Postgres URL is configured.");
  }

  const domains = productionDomains(after);
  console.log("\nShareable link(s):");
  if (domains.length === 0) {
    console.log("  (no production domain found yet — check the project's Deployments tab)");
  }
  for (const domain of domains) {
    console.log(`  https://${domain}/login`);
    console.log(`  https://${domain}  (redirects to /login)`);
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
