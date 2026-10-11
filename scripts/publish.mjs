// Publishes relays.json to bo.ava.do (run by .github/workflows/publish-relays.yml).
// Needs BO_ADMIN_TOKEN. Usage: node scripts/publish.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { publishRelays } from "./lib/publish.mjs";

const path = fileURLToPath(new URL("../relays.json", import.meta.url));
try {
  const updatedAt = await publishRelays({ text: readFileSync(path, "utf8"), token: process.env.BO_ADMIN_TOKEN });
  console.log(`mev-relays published (updatedAt ${updatedAt})`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
