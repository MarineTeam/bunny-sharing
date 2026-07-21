import { kvKeys, kvGet, kvDel } from "../../lib/kv";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const shareKeys = await kvKeys("bunnyshare:*");
    const shareRecords = await Promise.all(shareKeys.map((k) => kvGet(k)));
    const shareToDelete = shareRecords
      .map((r, i) => ({ record: r, key: shareKeys[i] }))
      .filter(({ record }) => record && (record.revoked || Date.now() > record.expiresAt));

    // Bundle records (lib/bundles.js) have no revoked flag of their own —
    // they're a grouping list, not a share; only expiry retires them here.
    const bundleKeys = await kvKeys("bunnybundle:*");
    const bundleRecords = await Promise.all(bundleKeys.map((k) => kvGet(k)));
    const bundleToDelete = bundleRecords
      .map((r, i) => ({ record: r, key: bundleKeys[i] }))
      .filter(({ record }) => record && Date.now() > record.expiresAt);

    await Promise.all([...shareToDelete, ...bundleToDelete].map(({ key }) => kvDel(key)));

    res.status(200).json({ deleted: shareToDelete.length + bundleToDelete.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
