import { readFileSync } from "node:fs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PUBKEY = /^0x[0-9a-f]{96}$/;

export function relayHost(url) {
  const after = String(url).split("@").pop().replace(/^https?:\/\//, "");
  return after.replace(/\/+$/, "").toLowerCase();
}

export function relayPubkey(url) {
  const m = /^https?:\/\/(0x[0-9a-fA-F]+)@/.exec(String(url));
  if (!m) return null;
  const k = m[1].toLowerCase();
  return PUBKEY.test(k) ? k : null;
}

export function validateRelays(doc) {
  const p = [];
  if (!doc || doc.schema !== 1) p.push("schema must be 1");
  if (!DATE.test(doc?.updatedAt || "")) p.push("updatedAt must be YYYY-MM-DD");
  if (doc?.network !== "mainnet") p.push("network must be mainnet");
  const ids = new Set();
  const hosts = new Set();
  for (const r of doc?.relays || []) {
    const tag = `relay ${r.id || "?"}:`;
    if (!/^[a-z0-9-]+$/.test(r.id || "")) p.push(`${tag} id must be a lower-case slug`);
    if (ids.has(r.id)) p.push(`${tag} duplicate id`);
    ids.add(r.id);
    if (!r.name) p.push(`${tag} name missing`);
    if (!relayPubkey(r.url)) p.push(`${tag} url must be https://0x<96 hex>@host`);
    const h = relayHost(r.url);
    if (hosts.has(h)) p.push(`${tag} duplicate host ${h}`);
    hosts.add(h);
    if (!["none", "sanctions"].includes(r.filtering)) p.push(`${tag} filtering must be none or sanctions`);
    if (!["live", "retired"].includes(r.status)) p.push(`${tag} status must be live or retired`);
    if (r.recommended === true && r.status !== "live") p.push(`${tag} recommended only on a live relay`);
    if (typeof r.recommended !== "boolean") p.push(`${tag} recommended must be true or false`);
    if (!DATE.test(r.statusSince || "")) p.push(`${tag} statusSince must be YYYY-MM-DD`);
    if (typeof r.note !== "string") p.push(`${tag} note must be a string`);
    if (!/^https:\/\//.test(r.about || "")) p.push(`${tag} about must be an https link`);
  }
  return p;
}

export function loadRelays(path = "relays.json") {
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const problems = validateRelays(doc);
  if (problems.length) throw new Error(`relays.json invalid:\n  ${problems.join("\n  ")}`);
  return doc;
}

export const recommendedLive = doc => doc.relays.filter(r => r.recommended && r.status === "live");
