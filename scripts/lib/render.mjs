import { recommendedLive, relayHost } from "./relays.mjs";

const FILTERING = { none: "No filtering", sanctions: "Filters sanctioned transactions" };

const statusText = r => (r.status === "live" ? "Live" : `No longer running (since ${r.statusSince})`);

export function renderTable(doc) {
  const rows = [
    ...doc.relays.filter(r => r.status === "live"),
    ...doc.relays.filter(r => r.status !== "live"),
  ].map(r => `| [${r.name}](${r.about}) | ${FILTERING[r.filtering]} | ${statusText(r)} | \`${r.url}\` |`);
  return ["| Relay | Filtering | Status | Relay URL |", "|---|---|---|---|", ...rows].join("\n") + "\n";
}

export const renderCopyString = doc => recommendedLive(doc).map(r => r.url).join(",");

export function renderRelaysMd(doc) {
  return [
    `Generated from relays.json on ${doc.updatedAt}; do not edit by hand.`,
    "",
    "<!-- relays:start -->",
    renderTable(doc) + "<!-- relays:end -->",
    "",
    "<!-- relays-string:start -->",
    "```",
    renderCopyString(doc),
    "```",
    "<!-- relays-string:end -->",
    "",
  ].join("\n");
}

export const renderDeadHosts = doc =>
  doc.relays.filter(r => r.status === "retired").map(r => relayHost(r.url)).join(" ");

function replaceOnce(text, pattern, replacement, what) {
  if (!pattern.test(text)) throw new Error(`${what} not found`);
  return text.replace(pattern, replacement);
}

export function applyPackageDefaults(doc, { manifestText, composeText, startShText }) {
  const relays = renderCopyString(doc);

  const manifest = JSON.parse(manifestText);
  const env = manifest.image?.environment || [];
  if (!env.some(e => e.startsWith("RELAYS="))) throw new Error("manifest RELAYS= entry not found");
  manifest.image.environment = env.map(e => (e.startsWith("RELAYS=") ? `RELAYS=${relays}` : e));

  return {
    manifestText: JSON.stringify(manifest, null, 2) + "\n",
    composeText: replaceOnce(composeText, /^(\s*- >-\n\s*)RELAYS=.*$/m,
      (_, lead) => `${lead}RELAYS=${relays}`, "compose RELAYS= entry after - >-"),
    startShText: replaceOnce(startShText, /^DEAD_RELAY_HOSTS=".*"$/m,
      () => `DEAD_RELAY_HOSTS="${renderDeadHosts(doc)}"`, "start.sh DEAD_RELAY_HOSTS line"),
  };
}
