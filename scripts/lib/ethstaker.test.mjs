import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseMainnetTable } from "./ethstaker.mjs";

const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

test("the saved ethstaker page yields the mainnet relays with their hosts", () => {
  const rows = parseMainnetTable(fixture("ethstaker-2026-10-11.md"));
  assert.ok(rows.length >= 9, `only ${rows.length} rows`);
  const hosts = rows.map(r => r.host);
  for (const h of ["aestus.live", "agnostic-relay.net", "relay.ultrasound.money", "boost-relay.flashbots.net",
    "global.titanrelay.xyz", "regional.titanrelay.xyz", "relay.wenmerge.com",
    "bloxroute.max-profit.blxrbdn.com", "bloxroute.regulated.blxrbdn.com"]) {
    assert.ok(hosts.includes(h), `missing ${h}`);
  }
  assert.ok(!hosts.some(h => h.includes("hoodi") || h.includes("sepolia")), "testnet rows leaked in");
  const aestus = rows.find(r => r.host === "aestus.live");
  assert.equal(aestus.name, "Aestus");
  assert.equal(aestus.about, "https://aestus.live");
  assert.equal(aestus.filteringText, "No filtering and no censorship");
  assert.equal(aestus.pubkey, "0xa15b52576bcbf1072f4a011c0f99f9fb6c66f3e1ff321f11f461d15e31b1cb359caa092c71bbded0bae5b5ea401aab7e");
  assert.match(rows.find(r => r.host === "boost-relay.flashbots.net").filteringText, /OFAC/);
});

test("a URL without backticks is read, and the Hoodi table below is ignored", () => {
  const rows = parseMainnetTable(fixture("ethstaker-variants.md"));
  assert.deepEqual(rows.map(r => r.host), ["backtick.example.org", "plain.example.org"]);
  const plain = rows[1];
  assert.equal(plain.name, "Plain Relay");
  assert.equal(plain.url, "https://0x" + "b".repeat(96) + "@plain.example.org");
  assert.equal(plain.pubkey, "0x" + "b".repeat(96));
  assert.equal(plain.filteringText, "Filters out OFAC sanctioned addresses");
});

test("a page without the mainnet heading yields no rows", () => {
  assert.deepEqual(parseMainnetTable("# Something else\n\n| a | b |\n|-|-|\n| x | y |\n"), []);
});
