import { useEffect, useState } from "react";

export default function Admin() {
  const [videos, setVideos] = useState([]);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [shareForVideo, setShareForVideo] = useState(null);
  const [email, setEmail] = useState("");
  const [hours, setHours] = useState(72);
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState(() => new Set());
  const [bulkEmail, setBulkEmail] = useState("");
  const [bulkHours, setBulkHours] = useState(72);
  const [bulkSending, setBulkSending] = useState(false);

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
      let msg = `Sent to ${email}`;
      if (data.failures) {
        msg += ` — FAILED for ${data.failures.map((f) => f.email).join(", ")} (link created, email not sent — see Resend in the table below)`;
      }
      setMessage(msg);
      setShareForVideo(null);
      setEmail("");
      loadAll();
    } else {
      setMessage(`Error: ${data.error}`);
    }
  }

  async function submitBulk() {
    const chosen = videos.filter((v) => selected.has(v.id));
    const emails = bulkEmail.split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e.includes("@"));
    if (chosen.length === 0 || emails.length === 0) return;
    setBulkSending(true);
    setMessage("Sending...");
    const res = await fetch("/api/share-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        videos: chosen.map((v) => ({ id: v.id, title: v.title })),
        emails,
        hours: bulkHours,
      }),
    });
    const data = await res.json();
    setBulkSending(false);
    if (data.ok) {
      const sentTo = data.recipients.map((r) => r.email).join(", ");
      let msg = `Created ${data.count} separate link${data.count !== 1 ? "s" : ""}; emailed ${sentTo}`;
      const bundleLines = data.recipients
        .filter((r) => r.bundleLink)
        .map((r) => `${r.email}: ${r.bundleLink}`)
        .join(" | ");
      if (bundleLines) msg += ` — Bundle pages: ${bundleLines}`;
      if (data.failures) {
        msg += ` — FAILED for ${data.failures.map((f) => f.email).join(", ")} (links created, email not sent — see Resend in the table below)`;
      }
      setMessage(msg);
      setSelected(new Set());
      setBulkEmail("");
      loadAll();
    } else {
      setMessage(`Error: ${data.error}`);
    }
  }

  async function cleanup() {
    if (!confirm("Delete all expired and revoked links from the database?")) return;
    setMessage("Cleaning up...");
    const res = await fetch("/api/cleanup", { method: "POST" });
    const data = await res.json();
    if (data.deleted !== undefined) {
      setMessage(`Removed ${data.deleted} stale link${data.deleted !== 1 ? "s" : ""}`);
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

  async function resend(token) {
    setMessage("Resending...");
    const res = await fetch("/api/share/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = await res.json();
    setMessage(data.ok ? "Email sent" : `Error: ${data.error}`);
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

      {selected.size > 0 && (
        <div style={styles.bulkBar}>
          <strong>{selected.size} selected</strong>
          <input
            type="text"
            placeholder="recipient emails, comma-separated"
            value={bulkEmail}
            onChange={(e) => setBulkEmail(e.target.value)}
            style={{ ...styles.input, flex: "1 1 220px", width: "auto", marginTop: 0 }}
          />
          <label style={{ whiteSpace: "nowrap" }}>
            Valid for (hrs):{" "}
            <input
              type="number"
              value={bulkHours}
              onChange={(e) => setBulkHours(e.target.value)}
              style={{ width: 70 }}
            />
          </label>
          <button
            onClick={submitBulk}
            disabled={!bulkEmail || bulkSending}
            style={styles.btn}
          >
            {bulkSending ? "Sending..." : `Send ${selected.size} video${selected.size !== 1 ? "s" : ""} (separate links per recipient)`}
          </button>
          <button onClick={() => setSelected(new Set())} style={styles.btnSecondary}>
            Clear
          </button>
        </div>
      )}

      <div style={styles.grid}>
        {videos.map((v) => (
          <div key={v.id} style={{ ...styles.card, outline: selected.has(v.id) ? "2px solid #1f6feb" : "none" }}>
            {v.thumbnail && <img src={v.thumbnail} alt={v.title} style={styles.thumb} />}
            <div style={{ padding: 10 }}>
              <label style={styles.selectLabel}>
                <input
                  type="checkbox"
                  checked={selected.has(v.id)}
                  onChange={() => toggleSelected(v.id)}
                />{" "}
                Select
              </label>
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

      <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 40 }}>
        <h2 style={{ margin: 0 }}>Shared Links</h2>
        <button onClick={cleanup} style={styles.btnCleanup}>
          🗑 Clean up expired &amp; revoked
        </button>
      </div>
      <table style={styles.table}>
        <thead>
          <tr>
            <th>Video</th>
            <th>Email</th>
            <th>Link</th>
            <th>Status</th>
            <th>Views</th>
            <th>Watched</th>
            <th>Expires</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {shares.map((s) => (
            <tr key={s.token}>
              <td>{s.videoTitle}</td>
              <td>{s.email}</td>
              <td>
                <a href={`/watch/${s.token}`} target="_blank" rel="noreferrer" style={{ fontSize: 13, wordBreak: "break-all" }}>
                  /watch/{s.token}
                </a>
              </td>
              <td>
                {statusOf(s)}
                {s.emailFailed && (
                  <div style={styles.emailFailedBadge} title={s.emailError || "Email failed to send"}>
                    ⚠ email failed
                  </div>
                )}
              </td>
              <td title={s.lastViewedAt ? `Last viewed ${new Date(s.lastViewedAt).toLocaleString()}` : "Never viewed"}>
                {s.viewCount ? `${s.viewCount}×` : "—"}
              </td>
              <td title={s.lastPlayedAt ? `Last played ${new Date(s.lastPlayedAt).toLocaleString()}${s.playCount ? `, ${s.playCount} play${s.playCount !== 1 ? "s" : ""}` : ""}` : "Never played"}>
                {s.completedAt ? "100% ✓" : s.maxProgressPct ? `${s.maxProgressPct}%` : s.playCount ? "started" : "—"}
              </td>
              <td>{new Date(s.expiresAt).toLocaleString()}</td>
              <td>
                {statusOf(s) === "Active" && s.emailFailed && (
                  <button onClick={() => resend(s.token)} style={styles.btn}>
                    Resend
                  </button>
                )}
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
  btnCleanup: { background: "#6e7681", color: "white", border: 0, padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 14 },
  message: { color: "#1f6feb" },
  bulkBar: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: 12, marginBottom: 16, border: "1px solid #1f6feb", background: "#eef4ff", borderRadius: 8 },
  selectLabel: { display: "block", fontSize: 13, color: "#57606a", marginBottom: 4, cursor: "pointer" },
  emailFailedBadge: { fontSize: 12, color: "#d1242f" },
};
