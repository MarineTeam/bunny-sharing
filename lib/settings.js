import { kvGet, kvSet } from "./kv";
import { normalizeEmail } from "./gate";

// Global, admin-editable app settings. Stored in its OWN KV namespace
// (`bunnysettings:global`) that can never collide with `bunnyshare:*` or
// `bunnybundle:*`. Everything here is additive to the app: a deployment that
// never writes settings reads the DEFAULTS below and behaves exactly as it
// did before this file existed (watermark off, no exemptions).
const SETTINGS_KEY = "bunnysettings:global";

const DEFAULTS = {
  // Global watermark default applied to any share that doesn't set its own
  // explicit per-share override. Off by default — watermarking is opt-in.
  watermarkDefault: false,
  // Viewers who are NEVER watermarked, however the global/per-share settings
  // resolve. This is how "exempt users such as admins" is modelled in an app
  // that has no user accounts or roles: by the verified recipient email.
  watermarkExemptEmails: [],
  // Same, by domain (e.g. "yourcompany.com" exempts every internal viewer).
  watermarkExemptDomains: [],
};

export async function getSettings() {
  const stored = (await kvGet(SETTINGS_KEY)) || {};
  return { ...DEFAULTS, ...stored };
}

// Persists a settings patch. Only the known keys are written, each normalized,
// so a malformed POST body can't inject arbitrary fields into the record.
export async function saveSettings(patch = {}) {
  const current = await getSettings();
  const next = {
    watermarkDefault:
      patch.watermarkDefault === undefined
        ? current.watermarkDefault
        : !!patch.watermarkDefault,
    watermarkExemptEmails: normalizeEmailList(
      patch.watermarkExemptEmails === undefined
        ? current.watermarkExemptEmails
        : patch.watermarkExemptEmails
    ),
    watermarkExemptDomains: normalizeDomainList(
      patch.watermarkExemptDomains === undefined
        ? current.watermarkExemptDomains
        : patch.watermarkExemptDomains
    ),
  };
  await kvSet(SETTINGS_KEY, next);
  return next;
}

function toList(v) {
  return Array.isArray(v) ? v : String(v || "").split(/[,;\s]+/);
}

function normalizeEmailList(v) {
  return [...new Set(toList(v).map((e) => normalizeEmail(e)).filter((e) => e.includes("@")))];
}

function normalizeDomainList(v) {
  return [
    ...new Set(
      toList(v)
        .map((d) => String(d || "").trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean)
    ),
  ];
}

// Decides whether a given viewer should see the email watermark on a given
// share. Resolution order, most-specific-wins with EXEMPTION on top:
//   1. exempt email or exempt domain  -> never watermark (trusted viewer)
//   2. explicit per-share override    -> use it (record.watermark true/false)
//   3. global default                 -> settings.watermarkDefault
// Exemption deliberately wins over a per-share "always": an exempt viewer
// (e.g. an internal admin) is never watermarked, even on a share marked to
// watermark by default. Flip this order here if the opposite policy is wanted.
export function resolveWatermark({ settings, recipientEmail, shareWatermark }) {
  const email = normalizeEmail(recipientEmail);
  const domain = email.split("@")[1] || "";
  if (settings.watermarkExemptEmails.includes(email)) return false;
  if (domain && settings.watermarkExemptDomains.includes(domain)) return false;
  if (typeof shareWatermark === "boolean") return shareWatermark;
  return !!settings.watermarkDefault;
}
