import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRelays, relayHost, relayPubkey, recommendedLive } from "./relays.mjs";

const relay = (over = {}) => ({
  id: "ultrasound", name: "Ultra Sound",
  url: "https://0xa1559ace749633b997cb3fdacffb890aeebdb0f5a3b6aaa7eeeaf1a38af0a8fe88b9e4b1f61f236d2e64d95733327a62@relay.ultrasound.money",
  about: "https://relay.ultrasound.money/", filtering: "none", recommended: true,
  status: "live", statusSince: "2026-10-11", note: "", ...over,
});
const doc = (relays) => ({ schema: 1, updatedAt: "2026-10-11", network: "mainnet", relays });

test("a good document has no problems", () => {
  assert.deepEqual(validateRelays(doc([relay()])), []);
});
test("duplicate ids and hosts are problems", () => {
  const p = validateRelays(doc([relay(), relay({ id: "ultrasound" })]));
  assert.ok(p.some(s => s.includes("duplicate id")));
  assert.ok(p.some(s => s.includes("duplicate host")));
});
test("recommended on a retired relay is a problem", () => {
  assert.ok(validateRelays(doc([relay({ status: "retired" })])).some(s => s.includes("recommended")));
});
test("a bad pubkey, a bad filtering value and a bad date are problems", () => {
  const p = validateRelays(doc([relay({ url: "https://0x1234@relay.ultrasound.money", filtering: "ofac", statusSince: "yesterday" })]));
  assert.equal(p.length, 3);
});
test("relayHost lower-cases and strips a trailing slash; relayPubkey lower-cases", () => {
  assert.equal(relayHost("https://0xAB@Relay.Example.ORG/"), "relay.example.org");
  assert.equal(relayPubkey("https://0xA1559ACE" + "a".repeat(88) + "@x"), "0xa1559ace" + "a".repeat(88));
  assert.equal(relayPubkey("https://relay.example.org"), null);
});
test("recommendedLive keeps file order and drops retired or not recommended", () => {
  const d = doc([relay({ id: "a", url: "https://0x" + "a".repeat(96) + "@a.x" }), relay({ id: "b", url: "https://0x" + "b".repeat(96) + "@b.x", status: "retired", recommended: false }), relay({ id: "c", url: "https://0x" + "c".repeat(96) + "@c.x", recommended: false })]);
  assert.deepEqual(recommendedLive(d).map(r => r.id), ["a"]);
});
test("a relay url must be https with only a host after the key", () => {
  const key = "0x" + "a".repeat(96);
  for (const url of [`http://${key}@relay.ultrasound.money`, `https://${key}@relay.ultrasound.money/path`, `https://${key}@relay.ultrasound.money/`]) {
    assert.ok(validateRelays(doc([relay({ url })])).some(s => s.includes("url must be")), url);
  }
});
