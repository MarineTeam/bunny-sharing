import { getSettings, saveSettings } from "../../lib/settings";

// Admin-only. Not under /api/watch/ or /api/bundle/, so the middleware matcher
// puts it behind Basic Auth automatically (invariant 7) — no per-route check
// needed here. GET reads current settings; POST saves a patch.
export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      return res.status(200).json({ settings: await getSettings() });
    }
    if (req.method === "POST") {
      const settings = await saveSettings(req.body || {});
      return res.status(200).json({ ok: true, settings });
    }
    return res.status(405).end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
