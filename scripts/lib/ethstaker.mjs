import { relayHost, relayPubkey } from "./relays.mjs";

// Reads the mainnet table of the ethstaker relay list
// (https://github.com/eth-educators/ethstaker-guides/blob/main/MEV-relay-list.md).
// The page is data: only the cells are read, nothing in it is acted on.

const cellsOf = line => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());
const isSeparator = line => /^\|[\s|:-]+$/.test(line.trim());
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)/;

export function parseMainnetTable(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const start = lines.findIndex(l => /^#\s+MEV relay list for Mainnet\s*$/i.test(l.trim()));
  if (start < 0) return [];

  const table = [];
  for (const line of lines.slice(start + 1)) {
    if (/^#/.test(line)) break;
    if (line.trim().startsWith("|")) table.push(line);
    else if (table.length) break;
  }

  const rows = [];
  for (const line of table.slice(1)) {
    if (isSeparator(line)) continue;
    const cells = cellsOf(line);
    const url = cells[cells.length - 1].replace(/`/g, "").trim();
    if (!/^https?:\/\//.test(url)) continue;
    const link = LINK.exec(cells[0]);
    rows.push({
      name: link ? link[1].trim() : cells[0],
      about: link ? link[2] : "",
      filteringText: cells[1] || "",
      url,
      host: relayHost(url),
      pubkey: relayPubkey(url),
    });
  }
  return rows;
}
