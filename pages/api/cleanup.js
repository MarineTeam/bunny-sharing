import { kvKeys, kvGet, kvDel } from "../../lib/kv";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const keys = await kvKeys("share:*");
    const now = Date.now();
    let deleted = 0;

    await Promise.all(
      keys.map(async (key) => {
        const record = await kvGet(key);
        if (record && record.expiresAt < now) {
          await kvDel(key);
          deleted++;
        }
      })
    );

    res.status(200).json({ ok: true, deleted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
