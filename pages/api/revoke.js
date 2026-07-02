import { kvGet, kvSet } from "../../lib/kv";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "token is required" });

    const record = await kvGet(`share:${token}`);
    if (!record) return res.status(404).json({ error: "Share not found" });

    record.revoked = true;
    await kvSet(`share:${token}`, record);

    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
