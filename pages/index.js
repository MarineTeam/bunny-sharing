import { useEffect, useState } from "react";

export default function Admin() {
  const [videos, setVideos] = useState([]);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shareForVideo, setShareForVideo] = useState(null);
  const [email, setEmail] = useState("");
  const [hours, setHours] = useState(72);
  const [message, setMessage] = useState("");

  async function loadAll() {
    setLoading(true);
    const [vRes, sRes] = await Promise.all([
      fetch("/api/videos").then((r) => r.json()),
      fetch("/api/shares").then((r) => r.json()),
    ]);
    setVideos(vRes.videos || []);
    setShares(sRes.shares || []);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function submitShare(video) {
    setMessage("Sending...");
    const res = await fetch("/api/share", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videoId: video.id,
        videoTitle: video.title,
        email,
        hours,
      }),
    });
    const data = await res.json();
    if (data.ok) {
      setMessage(`Sent to ${email}`);
      setShareForVideo(null);
      setEmail("");
      loadAll();
    } else {
      setMessage(`Error: ${data.error}`);
    }
  }

  async function revoke(token) {
    if (!confirm("Revoke this access link?")) return;
    await fetch("/api/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    loadAll();
  }

  function statusOf(s) {
    if (s.revoked) return "Revoked";
    if (Date.now() > s.expiresAt) return "Expired";
    return "Active";
  }

  if (loading) return <p style={{ padding: 20 }}>Loading...</p>;

  return (
    <div style={styles.wrap}>
      <h1>Video Library</h1>
      {message && <p style={styles.message}>{message}</p>}

      <div style={styles.grid}>
        {videos.map((v) => (
          <div key={v.id} style={styles.card}>
            {v.thumbnail && <img src={v.thumbnail} alt={v.title} style={styles.thumb} />}
            <div style={{ padding: 10 }}>
              <strong>{v.title}</strong>
              <div>
                <button onClick={() => setShareForVideo(v)} style={styles.btn}>
                  Share
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {shareForVideo && (
        <div style={styles.modal}>
          <h3>Share "{shareForVideo.title}"</h3>
          <input
            type="email"
            placeholder="recipient@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
          />
          <div style={{ marginTop: 8 }}>
            <label>Link valid for (hours): </label>
            <input
              type="number"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              style={{ width: 80 }}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={() => submitShare(shareForVideo)} style={styles.btn}>
              Send
            </button>
            <button onClick={() => setShareForVideo(null)} style={styles.btnSecondary}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 40, display: "flex", alignItems: "center", gap: 12 }}>
        <h2 style={{ margin: 0 }}>Shared Links</h2>
        <button
          onClick={async () => {
            const res = await fetch("/api/cleanup", { method: "POST" });
            const data = await res.json();
            setMessage(data.ok ? `Cleaned up ${data.deleted} expired link(s)` : `Error: ${data.error}`);
            loadAll();
          }}
          style={styles.btnSecondary}
        >
          Clean up expired
        </button>
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Video</th>
            <th>Email</th>
            <th>Status</th>
            <th>Expires</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {shares.map((s) => (
            <tr key={s.token}>
              <td>{s.videoTitle}</td>
              <td>{s.email}</td>
              <td>{statusOf(s)}</td>
              <td>{new Date(s.expiresAt).toLocaleString()}</td>
              <td>
                {statusOf(s) === "Active" && (
                  <button onClick={() => revoke(s.token)} style={styles.btnDanger}>
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const styles = {
  wrap: { fontFamily: "system-ui, sans-serif", maxWidth: 1000, margin: "0 auto", padding: 20 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 },
  card: { border: "1px solid #ddd", borderRadius: 8, overflow: "hidden" },
  thumb: { width: "100%", height: 120, objectFit: "cover" },
  btn: { background: "#1f6feb", color: "white", border: 0, padding: "6px 12px", borderRadius: 6, cursor: "pointer", marginTop: 8, marginRight: 8 },
  btnSecondary: { background: "#eee", border: 0, padding: "6px 12px", borderRadius: 6, cursor: "pointer" },
  btnDanger: { background: "#d1242f", color: "white", border: 0, padding: "4px 10px", borderRadius: 6, cursor: "pointer" },
  input: { width: "100%", padding: 8, border: "1px solid #ccc", borderRadius: 6 },
  modal: { border: "1px solid #ccc", borderRadius: 8, padding: 16, marginTop: 20, background: "#fafafa" },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 12 },
  message: { color: "#1f6feb" },
};
