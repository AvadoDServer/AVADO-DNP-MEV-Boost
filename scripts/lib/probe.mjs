import { relayHost, relayPubkey } from "./relays.mjs";

export const STRIKES = 3;

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// One relay, up to `attempts` tries; ok only on HTTP 200 from the builder status endpoint.
export async function probeRelay(host, { fetch = globalThis.fetch, attempts = 3, timeoutMs = 10000, waitMs = 20000, sleep = defaultSleep } = {}) {
  let status = null;
  let error = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(`https://${host}/eth/v1/builder/status`, { signal: AbortSignal.timeout(timeoutMs) });
      status = res.status;
      error = null;
      if (status === 200) return { host, ok: true, status, error };
    } catch (err) {
      status = null;
      error = err?.name === "TimeoutError" ? "timed out" : err?.cause?.code || err?.cause?.message || err?.message || String(err);
    }
    if (i < attempts) await sleep(waitMs);
  }
  return { host, ok: false, status, error };
}

const slug = name => String(name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "relay";

function uniqueId(base, taken) {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

// probes: { [host]: { ok, ... } }, failures: { [host]: consecutive failed weeks }.
// Returns new objects; the inputs are not modified.
export function decide({ doc, probes, ethstaker, failures, today }) {
  const newDoc = structuredClone(doc);
  const newFailures = { ...failures };
  const changes = [];
  const warnings = [];

  for (const r of newDoc.relays) {
    const host = relayHost(r.url);
    const probe = probes[host];
    if (!probe) continue;
    if (r.status === "live" && probe.ok) {
      delete newFailures[host];
    } else if (r.status === "live") {
      const n = (newFailures[host] || 0) + 1;
      if (n >= STRIKES) {
        Object.assign(r, { status: "retired", statusSince: today, recommended: false });
        delete newFailures[host];
        changes.push(`retired ${r.name} after ${STRIKES} failed weekly checks`);
      } else {
        newFailures[host] = n;
        warnings.push(`${r.name} did not answer (${n} of ${STRIKES})`);
      }
    } else if (r.status === "retired" && probe.ok) {
      Object.assign(r, { status: "live", statusSince: today });
      delete newFailures[host];
      changes.push(`${r.name} answers again; left not recommended`);
    }
  }

  const byHost = new Map(newDoc.relays.map(r => [relayHost(r.url), r]));
  const ids = new Set(newDoc.relays.map(r => r.id));
  for (const row of ethstaker) {
    const known = byHost.get(row.host);
    if (known) {
      if (row.pubkey !== relayPubkey(known.url)) warnings.push(`pubkey differs for ${known.name}; check by hand`);
      continue;
    }
    if (!row.pubkey) {
      warnings.push(`${row.name} on the ethstaker list has no usable relay URL; not added`);
      continue;
    }
    const id = uniqueId(slug(row.name), ids);
    ids.add(id);
    const added = {
      id,
      name: row.name,
      url: row.url,
      about: /^https:\/\//.test(row.about) ? row.about : `https://${row.host}`,
      filtering: /sanction|OFAC|regulated/i.test(row.filteringText) ? "sanctions" : "none",
      recommended: false,
      status: probes[row.host]?.ok ? "live" : "retired",
      statusSince: today,
      note: `new on the ethstaker list ${today}`,
    };
    newDoc.relays.push(added);
    byHost.set(row.host, added);
    changes.push(`added ${row.name} (not recommended)`);
  }

  if (changes.length > 0) newDoc.updatedAt = today;
  return { doc: newDoc, failures: newFailures, changes, warnings };
}

// probes: array of probeRelay results, in the order they were checked.
export function renderSummary({ today, probes, changes, warnings }) {
  const list = items => items.map(s => `- ${s}`);
  return [
    `## Relay check ${today}`,
    "",
    "| Host | Status | OK |",
    "|---|---|---|",
    ...probes.map(p => `| ${p.host} | ${p.status ?? p.error ?? "-"} | ${p.ok ? "yes" : "no"} |`),
    "",
    "### Changes",
    "",
    ...(changes.length ? list(changes) : ["No changes to the relay list."]),
    "",
    "### Warnings",
    "",
    ...(warnings.length ? list(warnings) : ["None."]),
    "",
    `A relay is retired only after ${STRIKES} failed weekly checks in a row. When this pull request changes relays.json, merging it publishes the list to the boxes.`,
    "",
  ].join("\n");
}
