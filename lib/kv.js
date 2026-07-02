// Thin wrapper around the Upstash Redis REST API.
// Works with Vercel's "Upstash for Redis" marketplace storage,
// or a standalone free Upstash database — both expose the same
// KV_REST_API_URL / KV_REST_API_TOKEN env vars.

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

async function kvFetch(path) {
  const res = await fetch(`${KV_URL}${path}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`KV error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export async function kvSet(key, value) {
  const encoded = encodeURIComponent(JSON.stringify(value));
  return kvFetch(`/set/${encodeURIComponent(key)}/${encoded}`);
}

export async function kvGet(key) {
  const r = await kvFetch(`/get/${encodeURIComponent(key)}`);
  return r.result ? JSON.parse(r.result) : null;
}

export async function kvDel(key) {
  return kvFetch(`/del/${encodeURIComponent(key)}`);
}

export async function kvKeys(pattern) {
  const r = await kvFetch(`/keys/${encodeURIComponent(pattern)}`);
  return r.result || [];
}
