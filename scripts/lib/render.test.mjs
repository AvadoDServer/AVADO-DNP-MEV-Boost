import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderTable, renderCopyString, renderRelaysMd, renderDeadHosts, applyPackageDefaults,
} from "./render.mjs";

const key = c => "0x" + c.repeat(96);
const relay = (id, over = {}) => ({
  id, name: `Relay ${id}`, url: `https://${key(id[0])}@${id}.example.org`,
  about: `https://${id}.example.org/`, filtering: "none", recommended: true,
  status: "live", statusSince: "2026-10-11", note: "", ...over,
});
const doc = {
  schema: 1, updatedAt: "2026-10-11", network: "mainnet",
  relays: [
    relay("a"),
    relay("b", { status: "retired", recommended: false, statusSince: "2026-09-01" }),
    relay("c", { filtering: "sanctions" }),
    relay("d", { recommended: false }),
  ],
};

test("the table has one row per relay, retired last, in plain words", () => {
  const lines = renderTable(doc).trim().split("\n");
  assert.equal(lines[0], "| Relay | Filtering | Status | Relay URL |");
  const rows = lines.slice(2);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(r => /\[Relay (\w)\]/.exec(r)[1]), ["a", "c", "d", "b"]);
  assert.ok(rows[0].includes("[Relay a](https://a.example.org/)"));
  assert.ok(rows[0].includes("No filtering"));
  assert.ok(rows[1].includes("Filters sanctioned transactions"));
  assert.ok(rows[0].includes("| Live |"));
  assert.ok(rows[3].includes("No longer running (since 2026-09-01)"));
  assert.ok(rows[0].includes("`" + doc.relays[0].url + "`"));
});

test("the copy string is the recommended live URLs joined by commas, no spaces", () => {
  const s = renderCopyString(doc);
  assert.equal(s, [doc.relays[0].url, doc.relays[2].url].join(","));
  assert.ok(!/\s/.test(s));
});

test("relays.md has the header, both marked blocks, and renders the same twice", () => {
  const md = renderRelaysMd(doc);
  assert.equal(md, renderRelaysMd(doc));
  assert.ok(md.startsWith("Generated from relays.json on 2026-10-11; do not edit by hand.\n"));
  assert.ok(md.includes("<!-- relays:start -->\n" + renderTable(doc)));
  assert.ok(md.includes("<!-- relays:end -->\n\n<!-- relays-string:start -->"));
  assert.ok(md.includes("```\n" + renderCopyString(doc) + "\n```\n<!-- relays-string:end -->"));
});

test("dead hosts are the retired hosts, space separated, in file order", () => {
  const d = { ...doc, relays: [...doc.relays, relay("e", { status: "retired", recommended: false })] };
  assert.equal(renderDeadHosts(d), "b.example.org e.example.org");
});

const manifestText = JSON.stringify({
  name: "mevboost.avado.dnp.dappnode.eth",
  image: { environment: ["NETWORK=mainnet", "RELAYS=https://old@old.example.org", "EXTRA_OPTS=-min-bid 0.05"], restart: "always" },
  dependencies: {},
}, null, 2) + "\n";
const composeText = [
  "services:",
  "  mevboost.avado.dnp.dappnode.eth:",
  "    environment:",
  "      - NETWORK=mainnet",
  "      - >-",
  "        RELAYS=https://old@old.example.org",
  "      - EXTRA_OPTS=-min-bid 0.05",
  "",
].join("\n");
const startShText = [
  "#!/bin/sh",
  "# keep me",
  'DEAD_RELAY_HOSTS="old.example.org"',
  'echo "${DEAD_RELAY_HOSTS}"',
  "",
].join("\n");
const files = { manifestText, composeText, startShText };

test("package defaults: the manifest changes only the RELAYS entry", () => {
  const out = applyPackageDefaults(doc, files);
  const env = JSON.parse(out.manifestText).image.environment;
  assert.deepEqual(env, ["NETWORK=mainnet", "RELAYS=" + renderCopyString(doc), "EXTRA_OPTS=-min-bid 0.05"]);
  const before = manifestText.split("\n"), after = out.manifestText.split("\n");
  assert.equal(after.length, before.length);
  assert.equal(before.filter((line, i) => line !== after[i]).length, 1);
});

test("package defaults: compose keeps the >- folded style", () => {
  const out = applyPackageDefaults(doc, files).composeText;
  assert.equal(out, composeText.replace("RELAYS=https://old@old.example.org", "RELAYS=" + renderCopyString(doc)));
  assert.ok(out.includes("      - >-\n        RELAYS="));
});

test("package defaults: start.sh changes only the DEAD_RELAY_HOSTS line", () => {
  const out = applyPackageDefaults(doc, files).startShText;
  assert.equal(out, startShText.replace('DEAD_RELAY_HOSTS="old.example.org"', 'DEAD_RELAY_HOSTS="b.example.org"'));
});

test("package defaults: a file without the expected entry is an error, not a silent no-op", () => {
  assert.throws(() => applyPackageDefaults(doc, { ...files, startShText: "#!/bin/sh\n" }), /DEAD_RELAY_HOSTS/);
  assert.throws(() => applyPackageDefaults(doc, { ...files, composeText: "services:\n" }), /RELAYS/);
});
