import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadRelays } from "./lib/relays.mjs";
import { applyPackageDefaults, renderCopyString, renderRelaysMd } from "./lib/render.mjs";

// Paths are relative to the repo root, wherever the script is run from.
const root = fileURLToPath(new URL("..", import.meta.url));
const at = name => root + name;
const PACKAGE_FILES = {
  manifestText: "dappnode_package.json",
  composeText: "docker-compose.yml",
  startShText: "build/start.sh",
};

const mode = process.argv[2] || "docs";
const doc = loadRelays(at("relays.json"));

if (mode === "docs") {
  writeFileSync(at("relays.md"), renderRelaysMd(doc));
  console.log("relays.md: written");
} else if (mode === "package") {
  const input = Object.fromEntries(
    Object.entries(PACKAGE_FILES).map(([key, name]) => [key, readFileSync(at(name), "utf8")]));
  const output = applyPackageDefaults(doc, input);
  for (const [key, name] of Object.entries(PACKAGE_FILES)) {
    writeFileSync(at(name), output[key]);
    console.log(`${name}: written`);
  }
} else if (mode === "--check") {
  const current = existsSync(at("relays.md")) ? readFileSync(at("relays.md"), "utf8") : "";
  if (current !== renderRelaysMd(doc)) {
    console.error("relays.md is out of date: run `node scripts/render.mjs` and commit it.");
    process.exit(1);
  }
  console.log("relays.md: up to date");
  const manifest = JSON.parse(readFileSync(at(PACKAGE_FILES.manifestText), "utf8"));
  const relaysEntry = (manifest.image?.environment || []).find(e => e.startsWith("RELAYS="));
  if (relaysEntry?.slice("RELAYS=".length) !== renderCopyString(doc)) {
    console.warn("warning: the RELAYS default in dappnode_package.json differs from relays.json; run `node scripts/render.mjs package` when releasing.");
  }
} else {
  console.error("usage: node scripts/render.mjs [docs|package|--check]");
  process.exit(2);
}
