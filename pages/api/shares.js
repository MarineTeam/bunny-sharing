import { kvKeys, kvGet } from "../../lib/kv";
import { baseUrl } from "../../lib/shares";
import { bundleLinksForTokens } from "../../lib/bundles";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  try {
    const keys = await kvKeys("bunnyshare:*");
    const records = await Promise.all(keys.map((k) => kvGet(k)));
    const shares = records.filter(Boolean).sort((a, b) => b.createdAt - a.createdAt);

    const siteUrl = baseUrl(req);
    const bundleLinks = await bundleLinksForTokens(shares.map((s) => s.token), siteUrl);
    const sharesWithBundle = shares.map((s) =>
      bundleLinks[s.token] ? { ...s, bundleLink: bundleLinks[s.token] } : s
    );

    res.status(200).json({ shares: sharesWithBundle });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
