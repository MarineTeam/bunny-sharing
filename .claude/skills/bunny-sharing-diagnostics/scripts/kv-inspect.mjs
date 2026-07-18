#!/usr/bin/env node
// kv-inspect.mjs — lists bunnyshare:* share records from Upstash Redis.
// Run from repo root:
//   node .claude/skills/bunny-sharing-diagnostics/scripts/kv-inspect.mjs [--json] [--token <t>]
// Requires KV_REST_API_URL and KV_REST_API_TOKEN in the environment
// (source .env.local first: `set -a; . ./.env.local; set +a`).

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

if (!KV_URL || !KV_TOKEN) {
  const missing = [!KV_URL && "KV_REST_API_URL", !KV_TOKEN && "KV_REST_API_TOKEN"].filter(Boolean);
  console.error(`MISSING ENV: ${missing.join(", ")}. Source your .env.local and retry.`);
  process.exit(2);
}

// Same REST pattern as lib/kv.js.
async function kvFetch(path) {
  const res = await fetch(`${KV_URL}${path}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  if (!res.ok) {
    throw new Error(`KV error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const tokenIdx = args.indexOf("--token");
const singleToken = tokenIdx !== -1 ? args[tokenIdx + 1] : null;

function statusOf(r) {
  if (r.revoked) return "Revoked";
  if (Date.now() > r.expiresAt) return "Expired";
  return "Active";
}

try {
  if (singleToken) {
    const r = await kvFetch(`/get/${encodeURIComponent(`bunnyshare:${singleToken}`)}`);
    const record = r.result ? JSON.parse(r.result) : null;
    if (!record) {
      console.log(`NOT FOUND: bunnyshare:${singleToken}`);
      process.exit(1);
    }
    console.log(JSON.stringify(record, null, 2));
    console.log(`status: ${statusOf(record)}`);
    process.exit(0);
  }

  const shareKeys = (await kvFetch(`/keys/${encodeURIComponent("bunnyshare:*")}`)).result || [];
  const throttleKeys = (await kvFetch(`/keys/${encodeURIComponent("gatethrottle:*")}`)).result || [];
  const records = await Promise.all(
    shareKeys.map(async (k) => {
      const r = await kvFetch(`/get/${encodeURIComponent(k)}`);
      return r.result ? JSON.parse(r.result) : null;
    })
  );

  const rows = records.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.log(`${rows.length} share record(s); ${throttleKeys.length} active gatethrottle key(s)\n`);
    for (const r of rows) {
      console.log(
        `${r.token.slice(0, 8)}…  ${statusOf(r).padEnd(7)}  ${String(r.videoTitle).slice(0, 30).padEnd(32)}  ${r.email}  expires ${new Date(r.expiresAt).toISOString()}`
      );
    }
  }
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  console.error("Interpretation: 401 = bad KV_REST_API_TOKEN; other statuses = see lib/kv.js error passthrough.");
  process.exit(1);
}
