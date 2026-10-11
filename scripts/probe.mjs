// Weekly relay check: probe every relay, compare with the ethstaker list, decide, write.
// Usage: node scripts/probe.mjs [--dry-run]   (--dry-run prints the summary and writes nothing)
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadRelays, relayHost, validateRelays } from "./lib/relays.mjs";
import { renderRelaysMd } from "./lib/render.mjs";
import { parseMainnetTable } from "./lib/ethstaker.mjs";
import { decide, probeRelay, renderSummary } from "./lib/probe.mjs";

const ETHSTAKER_URL = "https://raw.githubusercontent.com/eth-educators/ethstaker-guides/main/MEV-relay-list.md";
const root = fileURLToPath(new URL("..", import.meta.url));
const at = name => root + name;
const dryRun = process.argv.includes("--dry-run");
const today = new Date().toISOString().slice(0, 10);
const json = value => JSON.stringify(value, null, 2) + "\n";

const doc = loadRelays(at("relays.json"));
const failuresPath = at(".relay-check/failures.json");
const failures = existsSync(failuresPath) ? JSON.parse(readFileSync(failuresPath, "utf8")) : {};
const extraWarnings = [];

let ethstaker = [];
try {
  const res = await fetch(ETHSTAKER_URL, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  ethstaker = parseMainnetTable(await res.text());
  if (ethstaker.length === 0) extraWarnings.push("the ethstaker list had no mainnet relays; its layout may have changed");
} catch (err) {
  extraWarnings.push(`could not read the ethstaker list (${err.message}); only known relays were checked`);
}

const hosts = [...new Set([...doc.relays.map(r => relayHost(r.url)), ...ethstaker.map(r => r.host)])];
const results = [];
for (const host of hosts) results.push(await probeRelay(host));
const probes = Object.fromEntries(results.map(p => [p.host, p]));

const out = decide({ doc, probes, ethstaker, failures, today });
const warnings = [...extraWarnings, ...out.warnings];
const problems = validateRelays(out.doc);
if (problems.length) warnings.push(`the new list did not validate, so nothing was written: ${problems.join("; ")}`);

const summary = renderSummary({ today, probes: results, changes: out.changes, warnings });
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + "\n");

if (!dryRun) {
  mkdirSync(at(".relay-check"), { recursive: true });
  writeFileSync(at(".relay-check/summary.md"), summary);
  if (problems.length === 0) {
    writeFileSync(at("relays.json"), json(out.doc));
    writeFileSync(at("relays.md"), renderRelaysMd(out.doc));
    writeFileSync(failuresPath, json(out.failures));
  }
}
