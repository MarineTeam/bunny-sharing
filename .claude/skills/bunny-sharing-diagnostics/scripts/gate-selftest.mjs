#!/usr/bin/env node
// gate-selftest.mjs — 9-case crypto self-test for lib/gate.js (signGrant /
// verifyGrant / normalizeEmail). Run from repo root:
//   node .claude/skills/bunny-sharing-diagnostics/scripts/gate-selftest.mjs
//
// Needs no network and no real credentials. If GATE_SECRET is unset it sets a
// TEST-ONLY value for the duration of this process (and says so). Exit code 0
// iff all 9 cases pass.

// Suppress Node's "typeless package.json" reparse warning (lib/*.js are ESM
// but package.json has no "type" field — harmless, but noisy).
const origEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...args) => {
  const s = String(warning && warning.message ? warning.message : warning);
  if (s.includes("MODULE_TYPELESS_PACKAGE_JSON") || s.includes("Reparsing as ES module")) return;
  return origEmitWarning.call(process, warning, ...args);
};

// Resolve lib/gate.js relative to this script (script lives 4 dirs below repo root).
const gateUrl = new URL("../../../../lib/gate.js", import.meta.url);

if (!process.env.GATE_SECRET) {
  process.env.GATE_SECRET = "diagnostics-test-only-secret-do-not-use-in-prod";
  console.log("[info] GATE_SECRET was unset; using a TEST-ONLY value for this run.");
} else {
  console.log("[info] Using GATE_SECRET from the environment.");
}

let signGrant, verifyGrant, normalizeEmail;
try {
  ({ signGrant, verifyGrant, normalizeEmail } = await import(gateUrl));
} catch (err) {
  console.error(`FAIL: could not import lib/gate.js (${gateUrl.pathname}): ${err.message}`);
  process.exit(1);
}

const results = [];
function check(name, fn) {
  try {
    const ok = fn();
    results.push({ name, ok: !!ok });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  } catch (err) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name} — threw: ${err.message}`);
  }
}

const originalSecret = process.env.GATE_SECRET;
const g = signGrant({ token: "abc", email: "A@Ex.com", expiresAt: Date.now() + 60000 });

check("1. valid grant verifies (token-bound)", () => {
  const p = verifyGrant(g, { token: "abc" });
  return p && p.t === "abc";
});
check("2. email normalized in payload (.e === 'a@ex.com')", () => {
  const p = verifyGrant(g, { token: "abc" });
  return p && p.e === "a@ex.com";
});
check("3. wrong token binding rejected", () => verifyGrant(g, { token: "WRONG" }) === null);
check("4. tampered signature rejected", () => verifyGrant(g + "x", { token: "abc" }) === null);
check("5. expired grant rejected", () => {
  const expired = signGrant({ token: "abc", email: "a@ex.com", expiresAt: Date.now() - 1000 });
  return verifyGrant(expired, { token: "abc" }) === null;
});
check("6. garbage string rejected (no throw)", () => verifyGrant("garbage", { token: "abc" }) === null);
check("7. undefined rejected (no throw)", () => verifyGrant(undefined, { token: "abc" }) === null);
check("8. normalizeEmail trims + lowercases", () => normalizeEmail("  A@Ex.com ") === "a@ex.com");
check("9. grant signed under a different secret rejected", () => {
  process.env.GATE_SECRET = "a-completely-different-secret-value";
  const rejected = verifyGrant(g, { token: "abc" }) === null;
  process.env.GATE_SECRET = originalSecret; // restore
  return rejected;
});

const passed = results.filter((r) => r.ok).length;
console.log(`\nResult: ${passed}/${results.length} passed`);
if (passed === results.length) {
  console.log("PASS — gate crypto behaves as specified (signing, binding, expiry, tamper- and secret-rotation rejection).");
  process.exit(0);
} else {
  console.log("FAIL — lib/gate.js does not match its contract. Do NOT ship gate changes until this is 9/9.");
  process.exit(1);
}
