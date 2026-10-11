import { test } from "node:test";
import assert from "node:assert/strict";
import { publishRelays } from "./publish.mjs";

const text = JSON.stringify({ schema: 1, updatedAt: "2026-10-11", network: "mainnet", relays: [] }, null, 2) + "\n";

// A fake bo.ava.do: records every request, answers the write with `writeStatus`
// and the public read with `readBody`.
function fakeBo({ writeStatus = 200, readStatus = 200, readBody = JSON.stringify(text) } = {}) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url, ...init });
    if (init.method === "POST") return { ok: writeStatus < 300, status: writeStatus, text: async () => "" };
    return { ok: readStatus < 300, status: readStatus, text: async () => readBody };
  };
  return { fetch, calls };
}

test("writes relays.json as the mev-relays value with the admin token, then reads it back", async () => {
  const bo = fakeBo();
  assert.equal(await publishRelays({ text, token: "secret", fetch: bo.fetch }), "2026-10-11");
  assert.equal(bo.calls.length, 2);
  const [write, read] = bo.calls;
  assert.equal(write.url, "https://bo.ava.do/api/admin/value/mev-relays");
  assert.equal(write.method, "POST");
  assert.deepEqual(write.headers, { admintoken: "secret", "content-type": "application/json" });
  assert.deepEqual(JSON.parse(write.body), { value: text });
  assert.equal(read.url, "https://bo.ava.do/value/mev-relays");
  assert.equal(read.method ?? "GET", "GET");
});

test("a read-back that is JSON only once is accepted too", async () => {
  const bo = fakeBo({ readBody: text });
  assert.equal(await publishRelays({ text, token: "secret", fetch: bo.fetch }), "2026-10-11");
});

test("a missing token stops before any request", async () => {
  const bo = fakeBo();
  await assert.rejects(publishRelays({ text, token: "", fetch: bo.fetch }), /BO_ADMIN_TOKEN is not set/);
  assert.equal(bo.calls.length, 0);
});

test("a refused write fails with the status and skips the read-back", async () => {
  const bo = fakeBo({ writeStatus: 401 });
  await assert.rejects(publishRelays({ text, token: "wrong", fetch: bo.fetch }), /401/);
  assert.equal(bo.calls.length, 1);
});

test("a read-back with a different updatedAt fails", async () => {
  const old = JSON.stringify({ schema: 1, updatedAt: "2026-09-01", network: "mainnet", relays: [] });
  const bo = fakeBo({ readBody: JSON.stringify(old) });
  await assert.rejects(publishRelays({ text, token: "secret", fetch: bo.fetch }), /2026-09-01.*2026-10-11|2026-10-11.*2026-09-01/);
});

test("a failed read-back fails with the status", async () => {
  const bo = fakeBo({ readStatus: 404, readBody: "" });
  await assert.rejects(publishRelays({ text, token: "secret", fetch: bo.fetch }), /404/);
});
