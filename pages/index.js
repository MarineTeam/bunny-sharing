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
  const [selectedShares, setSelectedShares] = useState(() => new Set());
  const [resendingBulk, setResendingBulk] = useState(false);
  const [extendingBulk, setExtendingBulk] = useState(false);
  const [revokingBulk, setRevokingBulk] = useState(false);
  // Per-share watermark override chosen in the share forms: "default" (inherit
  // the global setting), "on" (always), or "off" (never).
  const [watermark, setWatermark] = useState("default");
  const [bulkWatermark, setBulkWatermark] = useState("default");
  // Global watermark settings (edited in the Settings panel below).
  const [wmDefault, setWmDefault] = useState(false);
  const [wmEmails, setWmEmails] = useState("");
  const [wmDomains, setWmDomains] = useState("");
  // Per-video watermark overrides, keyed by video id -> boolean.
  const [wmByVideo, setWmByVideo] = useState({});
  const [savingSettings, setSavingSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(false);

  function toggleSelected(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleShareSelected(token) {
    setSelectedShares((prev) => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  }

  async function loadAll() {
    setLoading(true);
    const [vRes, sRes, setRes] = await Promise.all([
      fetch("/api/videos").then((r) => r.json()),
      fetch("/api/shares").then((r) => r.json()),
      fetch("/api/settings").then((r) => r.json()).catch(() => ({})),
    ]);
    setVideos(vRes.videos || []);
    setShares(sRes.shares || []);
    if (setRes && setRes.settings) applySettings(setRes.settings);
    setLoading(false);
  }

  function applySettings(s) {
    setWmDefault(!!s.watermarkDefault);
    setWmEmails((s.watermarkExemptEmails || []).join(", "));
    setWmDomains((s.watermarkExemptDomains || []).join(", "));
    setWmByVideo(s.watermarkByVideo || {});
  }

  // Current per-video override as a select value: "on" / "off" / "default".
  function videoWmChoice(videoId) {
    const v = wmByVideo[videoId];
    return v === true ? "on" : v === false ? "off" : "default";
  }

  async function setVideoWatermark(videoId, choice) {
    setMessage("Updating watermark...");
    const res = await fetch("/api/video-watermark", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId, choice }),
    });
    const data = await res.json();
    if (data.ok) {
      setWmByVideo(data.settings.watermarkByVideo || {});
      setMessage("Watermark updated");
    } else {
      setMessage(`Error: ${data.error}`);
    }
  }

  // "default" → omit the field (JSON.stringify drops undefined) so the share
  // inherits the global setting; "on"/"off" → an explicit per-share override.
  function wmValue(sel) {
    return sel === "on" ? true : sel === "off" ? false : undefined;
  }

  async function saveSettings() {
    setSavingSettings(true);
    setMessage("Saving settings...");
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        watermarkDefault: wmDefault,
        watermarkExemptEmails: wmEmails,
        watermarkExemptDomains: wmDomains,
      }),
    });
    const data = await res.json();
    setSavingSettings(false);
    if (data.ok) {
      applySettings(data.settings);
      setMessage("Settings saved");
    } else {
      setMessage(`Error: ${data.error}`);
    }
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
        watermark: wmValue(watermark),
      }),
    });
    const data = await res.json();
    if (data.ok) {
      let msg = `Sent to ${email}`;
      const bundleLines = data.links
        .filter((l) => l.bundleLink)
        .map((l) => `${l.email}: ${l.bundleLink}`)
        .join(" | ");
      if (bundleLines) msg += ` — Bundle page: ${bundleLines}`;
      if (data.failures) {
        msg += ` — FAILED for ${data.failures.map((f) => f.email).join(", ")} (link created, email not sent — see Resend in the table below)`;
      }
      setMessage(msg);
      setShareForVideo(null);
      setEmail("");
      setWatermark("default");
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
        watermark: wmValue(bulkWatermark),
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

  async function resendSelected() {
    const tokens = [...selectedShares];
    if (tokens.length === 0) return;
    setResendingBulk(true);
    setMessage(`Resending ${tokens.length} link${tokens.length !== 1 ? "s" : ""}...`);
    const res = await fetch("/api/share/resend-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens }),
    });
    const data = await res.json();
    setResendingBulk(false);
    if (data.ok) {
      let msg = `Resent ${data.succeeded.length} of ${tokens.length}`;
      if (data.failures.length > 0) {
        msg += ` — FAILED for ${data.failures.length}: ${data.failures.map((f) => f.error).join("; ")}`;
      }
      setMessage(msg);
      setSelectedShares(new Set());
      loadAll();
    } else {
      setMessage(`Error: ${data.error}`);
    }
  }

  async function extend(token) {
    const hoursInput = prompt("Extend by how many hours?", "24");
    if (!hoursInput) return;
    setMessage("Extending...");
    const res = await fetch("/api/share/extend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, hours: Number(hoursInput) }),
    });
    const data = await res.json();
    setMessage(data.ok ? `Extended to ${new Date(data.expiresAt).toLocaleString()}` : `Error: ${data.error}`);
    loadAll();
  }

  async function extendSelected() {
    const tokens = [...selectedShares];
    if (tokens.length === 0) return;
    const hoursInput = prompt(`Extend ${tokens.length} link${tokens.length !== 1 ? "s" : ""} by how many hours?`, "24");
    if (!hoursInput) return;
    setExtendingBulk(true);
    setMessage(`Extending ${tokens.length} link${tokens.length !== 1 ? "s" : ""}...`);
    const res = await fetch("/api/share/extend-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens, hours: Number(hoursInput) }),
    });
    const data = await res.json();
    setExtendingBulk(false);
    if (data.ok) {
      let msg = `Extended ${data.succeeded.length} of ${tokens.length}`;
      if (data.failures.length > 0) {
        msg += ` — FAILED for ${data.failures.length}: ${data.failures.map((f) => f.error).join("; ")}`;
      }
      setMessage(msg);
      setSelectedShares(new Set());
      loadAll();
    } else {
      setMessage(`Error: ${data.error}`);
    }
  }

  async function revokeSelected() {
    const tokens = [...selectedShares];
    if (tokens.length === 0) return;
    if (!confirm(`Revoke ${tokens.length} access link${tokens.length !== 1 ? "s" : ""}?`)) return;
    setRevokingBulk(true);
    setMessage(`Revoking ${tokens.length} link${tokens.length !== 1 ? "s" : ""}...`);
    const res = await fetch("/api/revoke-bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens }),
    });
    const data = await res.json();
    setRevokingBulk(false);
    if (data.ok) {
      let msg = `Revoked ${data.succeeded.length} of ${tokens.length}`;
      if (data.failures.length > 0) {
        msg += ` — FAILED for ${data.failures.length}: ${data.failures.map((f) => f.error).join("; ")}`;
      }
      setMessage(msg);
      setSelectedShares(new Set());
      loadAll();
    } else {
      setMessage(`Error: ${data.error}`);
    }
  }

  function statusOf(s) {
    if (s.revoked) return "Revoked";
    if (Date.now() > s.expiresAt) return "Expired";
    return "Active";
  }

  if (loading) return <p style={{ padding: 20 }}>Loading...</p>;

  const analytics = computeAnalytics(shares);

  return (
    <div style={styles.wrap}>
      <h1>Video Library</h1>
      {message && <p style={styles.message}>{message}</p>}

      <div style={styles.panelToggles}>
        <button onClick={() => setShowSettings((v) => !v)} style={styles.btnSecondary}>
          {showSettings ? "Hide settings" : "⚙ Settings"}
        </button>
        <button onClick={() => setShowAnalytics((v) => !v)} style={styles.btnSecondary}>
          {showAnalytics ? "Hide analytics" : "📊 Analytics"}
        </button>
      </div>

      {showSettings && (
        <div style={styles.panel}>
          <h3 style={{ marginTop: 0 }}>Watermark settings</h3>
          <label style={{ display: "block", marginBottom: 12 }}>
            <input
              type="checkbox"
              checked={wmDefault}
              onChange={(e) => setWmDefault(e.target.checked)}
            />{" "}
            Watermark the viewer's email over every player by default
          </label>
          <label style={styles.settingLabel}>
            Exempt emails — never watermarked (comma/space separated)
            <textarea
              value={wmEmails}
              onChange={(e) => setWmEmails(e.target.value)}
              placeholder="admin@you.com, reviewer@you.com"
              style={styles.textarea}
            />
          </label>
          <label style={styles.settingLabel}>
            Exempt domains — never watermarked (e.g. your internal domain)
            <textarea
              value={wmDomains}
              onChange={(e) => setWmDomains(e.target.value)}
              placeholder="yourcompany.com"
              style={styles.textarea}
            />
          </label>
          <p style={styles.hint}>
            Resolution order (most specific wins): an exempt viewer is never
            watermarked; otherwise a share's own Always/Never (Share form) wins;
            otherwise the video's own Always/Never (select on each Videos row);
            otherwise this global default. Note: the watermark is a client-side
            overlay for leak attribution, not burned into the video — it deters
            casual re-sharing, it isn't DRM.
          </p>
          <button onClick={saveSettings} disabled={savingSettings} style={styles.btn}>
            {savingSettings ? "Saving..." : "Save settings"}
          </button>
        </div>
      )}

      {showAnalytics && (
        <div style={styles.panel}>
          <h3 style={{ marginTop: 0 }}>Per-video analytics</h3>
          {analytics.length === 0 ? (
            <p style={styles.hint}>No shares yet.</p>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.thLeft}>Video</th>
                  <th>Shares</th>
                  <th>Recipients</th>
                  <th>Views</th>
                  <th>Started</th>
                  <th>Completed</th>
                  <th>Avg progress</th>
                </tr>
              </thead>
              <tbody>
                {analytics.map((a) => (
                  <tr key={a.videoId}>
                    <td>{a.title}</td>
                    <td style={styles.tdCenter}>{a.shares}</td>
                    <td style={styles.tdCenter}>{a.recipients}</td>
                    <td style={styles.tdCenter}>{a.views}</td>
                    <td style={styles.tdCenter}>{a.started}</td>
                    <td style={styles.tdCenter}>
                      {a.completed} ({a.completionRate}%)
                    </td>
                    <td style={styles.tdCenter}>{a.avgProgress ? `${a.avgProgress}%` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

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
          <label style={{ whiteSpace: "nowrap" }}>
            Watermark:{" "}
            <select value={bulkWatermark} onChange={(e) => setBulkWatermark(e.target.value)}>
              <option value="default">Default</option>
              <option value="on">Always</option>
              <option value="off">Never</option>
            </select>
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
              <label style={styles.videoWmLabel}>
                Watermark:{" "}
                <select
                  value={videoWmChoice(v.id)}
                  onChange={(e) => setVideoWatermark(v.id, e.target.value)}
                >
                  <option value="default">Default</option>
                  <option value="on">Always</option>
                  <option value="off">Never</option>
                </select>
              </label>
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
          <div style={{ marginTop: 8 }}>
            <label>Watermark viewer's email: </label>
            <select value={watermark} onChange={(e) => setWatermark(e.target.value)}>
              <option value="default">Default (global setting)</option>
              <option value="on">Always</option>
              <option value="off">Never</option>
            </select>
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

      {selectedShares.size > 0 && (
        <div style={styles.bulkBar}>
          <strong>{selectedShares.size} link{selectedShares.size !== 1 ? "s" : ""} selected</strong>
          <button onClick={resendSelected} disabled={resendingBulk} style={styles.btn}>
            {resendingBulk ? "Resending..." : `Resend ${selectedShares.size}`}
          </button>
          <button onClick={extendSelected} disabled={extendingBulk} style={styles.btn}>
            {extendingBulk ? "Extending..." : `Extend ${selectedShares.size}`}
          </button>
          <button onClick={revokeSelected} disabled={revokingBulk} style={styles.btnDanger}>
            {revokingBulk ? "Revoking..." : `Revoke ${selectedShares.size}`}
          </button>
          <button onClick={() => setSelectedShares(new Set())} style={styles.btnSecondary}>
            Clear
          </button>
        </div>
      )}

      <table style={styles.table}>
        <thead>
          <tr>
            <th></th>
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
          {shares.map((s) => {
            const active = statusOf(s) === "Active";
            const extendable = !s.revoked; // extend works on Active or Expired, just not Revoked
            return (
              <tr key={s.token}>
                <td>
                  {extendable && (
                    <input
                      type="checkbox"
                      checked={selectedShares.has(s.token)}
                      onChange={() => toggleShareSelected(s.token)}
                    />
                  )}
                </td>
                <td>
                  {s.videoTitle}
                  {s.watermark === true && (
                    <span style={styles.wmBadge} title="Watermark: always on for this share">
                      💧
                    </span>
                  )}
                  {s.watermark === false && (
                    <span style={styles.wmBadgeOff} title="Watermark: off for this share">
                      no-wm
                    </span>
                  )}
                </td>
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
                  {active && (
                    <button onClick={() => resend(s.token)} style={styles.btn}>
                      Resend
                    </button>
                  )}
                  {extendable && (
                    <button onClick={() => extend(s.token)} style={styles.btn}>
                      Extend
                    </button>
                  )}
                  {active && (
                    <button onClick={() => revoke(s.token)} style={styles.btnDanger}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Rolls the per-share tracking fields up per video for the Analytics panel.
// Reads only additive fields already present on records (viewCount, playCount,
// maxProgressPct, completedAt) — nothing new is stored for this.
function computeAnalytics(shares) {
  const byVideo = new Map();
  for (const s of shares) {
    const key = s.videoId;
    let a = byVideo.get(key);
    if (!a) {
      a = {
        videoId: key,
        title: s.videoTitle || key,
        shares: 0,
        recipients: new Set(),
        views: 0,
        started: 0,
        completed: 0,
        progressSum: 0,
        progressCount: 0,
      };
      byVideo.set(key, a);
    }
    a.shares += 1;
    if (s.email) a.recipients.add(String(s.email).toLowerCase());
    a.views += s.viewCount || 0;
    if (s.playCount || s.maxProgressPct || s.completedAt) a.started += 1;
    if (s.completedAt) a.completed += 1;
    if (s.maxProgressPct) {
      a.progressSum += s.maxProgressPct;
      a.progressCount += 1;
    }
  }
  return [...byVideo.values()]
    .map((a) => ({
      videoId: a.videoId,
      title: a.title,
      shares: a.shares,
      recipients: a.recipients.size,
      views: a.views,
      started: a.started,
      completed: a.completed,
      completionRate: a.shares ? Math.round((a.completed / a.shares) * 100) : 0,
      avgProgress: a.progressCount ? Math.round(a.progressSum / a.progressCount) : 0,
    }))
    .sort((x, y) => y.shares - x.shares || y.views - x.views);
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
  videoWmLabel: { display: "block", fontSize: 12, color: "#57606a", margin: "6px 0" },
  emailFailedBadge: { fontSize: 12, color: "#d1242f" },
  panelToggles: { display: "flex", gap: 10, margin: "8px 0 4px" },
  panel: { border: "1px solid #d0d7de", borderRadius: 8, padding: 16, margin: "8px 0 20px", background: "#f6f8fa" },
  settingLabel: { display: "block", fontSize: 14, color: "#24292f", marginBottom: 12 },
  textarea: { display: "block", width: "100%", minHeight: 48, marginTop: 4, padding: 8, border: "1px solid #ccc", borderRadius: 6, fontFamily: "inherit", fontSize: 14, boxSizing: "border-box" },
  hint: { fontSize: 13, color: "#57606a" },
  thLeft: { textAlign: "left" },
  tdCenter: { textAlign: "center" },
  wmBadge: { marginLeft: 6, fontSize: 12 },
  wmBadgeOff: { marginLeft: 6, fontSize: 11, color: "#57606a", border: "1px solid #d0d7de", borderRadius: 4, padding: "0 4px" },
};
