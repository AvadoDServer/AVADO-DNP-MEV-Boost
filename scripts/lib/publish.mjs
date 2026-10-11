// Publishes relays.json to bo.ava.do as the public value `mev-relays`, which the
// Admin reads. The repo wins: every publish overwrites what is there.
export const KEY = "mev-relays";

export async function publishRelays({ text, token, fetch = globalThis.fetch, base = "https://bo.ava.do" }) {
  if (!token) throw new Error("BO_ADMIN_TOKEN is not set");
  const local = JSON.parse(text).updatedAt;

  const write = await fetch(`${base}/api/admin/value/${KEY}`, {
    method: "POST",
    headers: { admintoken: token, "content-type": "application/json" },
    body: JSON.stringify({ value: text }),
  });
  if (!write.ok) throw new Error(`bo.ava.do refused the write: HTTP ${write.status}`);

  const read = await fetch(`${base}/value/${KEY}`);
  if (!read.ok) throw new Error(`could not read ${KEY} back: HTTP ${read.status}`);
  // The public value is a JSON string holding the JSON text; accept it encoded once too.
  let value = JSON.parse(await read.text());
  if (typeof value === "string") value = JSON.parse(value);
  if (value?.updatedAt !== local) {
    throw new Error(`read back updatedAt ${value?.updatedAt} but relays.json has ${local}`);
  }
  return local;
}
