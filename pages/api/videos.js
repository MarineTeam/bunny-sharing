import { listVideos } from "../../lib/bunny";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  try {
    const videos = await listVideos();
    res.status(200).json({ videos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
