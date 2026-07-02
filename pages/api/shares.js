import { kvKeys, kvGet } from "../../lib/kv";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  try {
    const keys = await kvKeys("share:*");
    const records = await Promise.all(keys.map((k) => kvGet(k)));
    const shares = records.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);
    res.status(200).json({ shares });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
