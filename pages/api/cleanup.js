import { kvKeys, kvGet, kvDel } from "../../lib/kv";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const keys = await kvKeys("bunnyshare:*");
    const records = await Promise.all(keys.map((k) => kvGet(k)));

    const toDelete = records
      .map((r, i) => ({ record: r, key: keys[i] }))
      .filter(({ record }) => record && (record.revoked || Date.now() > record.expiresAt));

    await Promise.all(toDelete.map(({ key }) => kvDel(key)));

    res.status(200).json({ deleted: toDelete.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
