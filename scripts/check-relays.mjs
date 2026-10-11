import { loadRelays, recommendedLive } from "./lib/relays.mjs";

const path = process.argv[2] || "relays.json";
try {
  const doc = loadRelays(path);
  console.log(`relays.json: ok (${doc.relays.length} relays, ${recommendedLive(doc).length} recommended)`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
