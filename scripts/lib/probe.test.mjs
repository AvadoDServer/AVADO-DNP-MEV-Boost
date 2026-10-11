import { test } from "node:test";
import assert from "node:assert/strict";
import { probeRelay, decide, renderSummary } from "./probe.mjs";

const noSleep = async () => {};
const response = status => ({ status, ok: status >= 200 && status < 300 });

test("probeRelay retries until the relay answers 200", async () => {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    if (calls.length < 3) throw new Error("connect ECONNREFUSED");
    return response(200);
  };
  const r = await probeRelay("relay.example.org", { fetch, sleep: noSleep });
  assert.deepEqual(r, { host: "relay.example.org", ok: true, status: 200, error: null });
  assert.equal(calls.length, 3);
  assert.equal(calls[0], "https://relay.example.org/eth/v1/builder/status");
});

test("probeRelay gives up after three failed attempts and waits between them", async () => {
  let calls = 0;
  const waits = [];
  const fetch = async () => { calls++; throw new Error("getaddrinfo ENOTFOUND"); };
  const r = await probeRelay("gone.example.org", { fetch, sleep: async ms => waits.push(ms), waitMs: 5 });
  assert.equal(r.ok, false);
  assert.equal(r.status, null);
  assert.match(r.error, /ENOTFOUND/);
  assert.equal(calls, 3);
  assert.deepEqual(waits, [5, 5]);
});

test("probeRelay counts a non-200 answer as a failure and keeps the status", async () => {
  const r = await probeRelay("busy.example.org", { fetch: async () => response(503), sleep: noSleep });
  assert.equal(r.ok, false);
  assert.equal(r.status, 503);
});

// --- decide ---

const key = c => "0x" + c.repeat(96);
const relay = (over = {}) => ({
  id: "alpha", name: "Alpha", url: `https://${key("a")}@alpha.example.org`,
  about: "https://alpha.example.org", filtering: "none", recommended: true,
  status: "live", statusSince: "2026-01-01", note: "", ...over,
});
const docOf = (...relays) => ({ schema: 1, updatedAt: "2026-01-01", network: "mainnet", relays });
const ok = host => ({ host, ok: true, status: 200, error: null });
const failed = host => ({ host, ok: false, status: null, error: "timeout" });
const today = "2026-10-12";

test("a live relay is retired only after the third failed week in a row", () => {
  let doc = docOf(relay());
  let failures = {};
  const week = () => decide({ doc, probes: { "alpha.example.org": failed("alpha.example.org") }, ethstaker: [], failures, today });

  let r = week();
  assert.equal(r.failures["alpha.example.org"], 1);
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.warnings, ["Alpha did not answer (1 of 3)"]);
  assert.equal(r.doc.relays[0].status, "live");
  assert.equal(r.doc.updatedAt, "2026-01-01");
  ({ doc, failures } = r);

  r = week();
  assert.equal(r.failures["alpha.example.org"], 2);
  assert.deepEqual(r.warnings, ["Alpha did not answer (2 of 3)"]);
  assert.equal(r.doc.relays[0].status, "live");
  ({ doc, failures } = r);

  r = week();
  assert.deepEqual(r.changes, ["retired Alpha after 3 failed weekly checks"]);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.doc.relays[0].status, "retired");
  assert.equal(r.doc.relays[0].recommended, false);
  assert.equal(r.doc.relays[0].statusSince, today);
  assert.equal(r.doc.updatedAt, today);
  assert.equal(r.failures["alpha.example.org"], undefined);
});

test("a success resets the failure count of a live relay", () => {
  const r = decide({ doc: docOf(relay()), probes: { "alpha.example.org": ok("alpha.example.org") },
    ethstaker: [], failures: { "alpha.example.org": 2 }, today });
  assert.deepEqual(r.failures, {});
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.doc.relays[0].status, "live");
});

test("a retired relay that answers again comes back live but not recommended", () => {
  const r = decide({ doc: docOf(relay({ status: "retired", recommended: false })),
    probes: { "alpha.example.org": ok("alpha.example.org") }, ethstaker: [], failures: {}, today });
  assert.equal(r.doc.relays[0].status, "live");
  assert.equal(r.doc.relays[0].recommended, false);
  assert.equal(r.doc.relays[0].statusSince, today);
  assert.deepEqual(r.changes, ["Alpha answers again; left not recommended"]);
  assert.equal(r.doc.updatedAt, today);
});

test("a retired relay that still does not answer is left alone", () => {
  const r = decide({ doc: docOf(relay({ status: "retired", recommended: false })),
    probes: { "alpha.example.org": failed("alpha.example.org") }, ethstaker: [], failures: {}, today });
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.failures, {});
});

const ethRow = (over = {}) => ({
  name: "Beta Relay", about: "https://beta.example.org", filteringText: "Filters out OFAC sanctioned addresses",
  url: `https://${key("b")}@beta.example.org`, host: "beta.example.org", pubkey: key("b"), ...over,
});

test("a relay new on the ethstaker list is added, not recommended, with sanctions filtering detected", () => {
  const r = decide({ doc: docOf(relay()), probes: { "alpha.example.org": ok("alpha.example.org"), "beta.example.org": ok("beta.example.org") },
    ethstaker: [ethRow()], failures: {}, today });
  assert.equal(r.doc.relays.length, 2);
  assert.deepEqual(r.doc.relays[1], {
    id: "beta-relay", name: "Beta Relay", url: `https://${key("b")}@beta.example.org`,
    about: "https://beta.example.org", filtering: "sanctions", recommended: false,
    status: "live", statusSince: today, note: `new on the ethstaker list ${today}`,
  });
  assert.deepEqual(r.changes, ["added Beta Relay (not recommended)"]);
  assert.equal(r.doc.updatedAt, today);
});

test("a new relay that does not answer is added as retired, unfiltered when nothing says otherwise, with a unique id", () => {
  const r = decide({ doc: docOf(relay({ id: "beta-relay" })), probes: { "beta.example.org": failed("beta.example.org") },
    ethstaker: [ethRow({ filteringText: "No filtering and no censorship" })], failures: {}, today });
  const added = r.doc.relays[1];
  assert.equal(added.id, "beta-relay-2");
  assert.equal(added.status, "retired");
  assert.equal(added.filtering, "none");
  assert.equal(added.recommended, false);
});

test("a different pubkey on the ethstaker list is only a warning", () => {
  const doc = docOf(relay());
  const r = decide({ doc, probes: { "alpha.example.org": ok("alpha.example.org") },
    ethstaker: [ethRow({ name: "Alpha", host: "alpha.example.org", url: `https://${key("c")}@alpha.example.org`, pubkey: key("c") })],
    failures: {}, today });
  assert.deepEqual(r.warnings, ["pubkey differs for Alpha; check by hand"]);
  assert.deepEqual(r.changes, []);
  assert.deepEqual(r.doc, doc);
});

test("with no changes updatedAt stays and the input is not modified", () => {
  const doc = docOf(relay());
  const before = structuredClone(doc);
  const failures = { "alpha.example.org": 1 };
  const r = decide({ doc, probes: { "alpha.example.org": failed("alpha.example.org") },
    ethstaker: [ethRow({ name: "Alpha", host: "alpha.example.org", url: relay().url, pubkey: key("a") })], failures, today });
  assert.deepEqual(r.changes, []);
  assert.equal(r.doc.updatedAt, "2026-01-01");
  assert.deepEqual(doc, before);
  assert.deepEqual(failures, { "alpha.example.org": 1 });
});

test("renderSummary lists every probe, the changes and the warnings", () => {
  const md = renderSummary({ today, probes: [ok("alpha.example.org"), failed("beta.example.org")],
    changes: ["added Beta Relay (not recommended)"], warnings: ["Alpha did not answer (1 of 3)"] });
  assert.match(md, /\| alpha\.example\.org \| 200 \| yes \|/);
  assert.match(md, /\| beta\.example\.org \| timeout \| no \|/);
  assert.match(md, /- added Beta Relay \(not recommended\)/);
  assert.match(md, /- Alpha did not answer \(1 of 3\)/);
  assert.match(renderSummary({ today, probes: [], changes: [], warnings: [] }), /No changes/);
});
