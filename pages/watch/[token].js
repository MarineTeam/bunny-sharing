import { useState } from "react";
import { kvGet, kvSet } from "../../lib/kv";
import { generateEmbedUrl } from "../../lib/bunny";
import { signGrant, verifyGrant } from "../../lib/gate";

export default function WatchPage({ status, reason, embedUrl, title, token, notice }) {
  if (status === "invalid") {
    return (
      <div style={styles.wrap}>
        <h2>This link isn't available</h2>
        <p>{reason}</p>
      </div>
    );
  }

  if (status === "authorized") {
    return (
      <div style={styles.wrap}>
        <h2>{title}</h2>
        <div style={styles.playerBox}>
          <iframe
            src={embedUrl}
            loading="lazy"
            style={styles.iframe}
            allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  return <EmailGate token={token} title={title} notice={notice} />;
}

function EmailGate({ token, title, notice }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle"); // idle | sending | sent | error
  const [message, setMessage] = useState("");

  async function submit(e) {
    e.preventDefault();
    setState("sending");
    setMessage("");
    try {
      const res = await fetch("/api/watch/request-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email }),
      });
      const data = await res.json();
      if (res.ok) {
        setState("sent");
        setMessage(data.message || "Check your email for a sign-in link.");
      } else {
        setState("error");
        setMessage(data.error || "Something went wrong. Please try again.");
      }
    } catch {
      setState("error");
      setMessage("Something went wrong. Please try again.");
    }
  }

  if (state === "sent") {
    return (
      <div style={styles.wrap}>
        <h2>Check your email</h2>
        <p>{message}</p>
        <p style={styles.muted}>
          Click the link in that email to start watching. It expires shortly, so
          if it's been a while just request a new one.
        </p>
      </div>
    );
  }

  return (
    <div style={styles.wrap}>
      <h2>Confirm your email to watch{title ? ` "${title}"` : ""}</h2>
      <p style={styles.muted}>
        This video was shared privately. Enter the email address it was shared
        with and we'll send you a one-time sign-in link.
      </p>
      {notice && <p style={styles.notice}>{notice}</p>}
      <form onSubmit={submit} style={styles.form}>
        <input
          type="email"
          required
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={styles.input}
        />
        <button type="submit" disabled={state === "sending"} style={styles.btn}>
          {state === "sending" ? "Sending..." : "Email me a sign-in link"}
        </button>
      </form>
      {state === "error" && <p style={styles.error}>{message}</p>}
    </div>
  );
}

function cookieName(token) {
  return `gate_${token}`;
}

function parseCookies(header) {
  const out = {};
  (header || "").split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

export async function getServerSideProps({ params, query, req, res }) {
  const { token } = params;
  const record = await kvGet(`bunnyshare:${token}`);

  if (!record) {
    return { props: { status: "invalid", reason: "Link not found." } };
  }
  if (record.revoked) {
    return { props: { status: "invalid", reason: "Access to this video has been revoked." } };
  }
  if (Date.now() > record.expiresAt) {
    return { props: { status: "invalid", reason: "This link has expired." } };
  }

  // 1. Fresh magic-link click: exchange the short-lived ?grant= for a scoped,
  //    longer-lived cookie, then redirect to the clean URL so the one-time
  //    grant doesn't linger in the address bar or browser history.
  if (query.grant) {
    const payload = verifyGrant(query.grant, { token });
    if (payload) {
      const cookieGrant = signGrant({
        token,
        email: record.email,
        expiresAt: record.expiresAt,
      });
      const maxAge = Math.max(0, Math.floor((record.expiresAt - Date.now()) / 1000));
      const proto =
        req.headers["x-forwarded-proto"] ||
        ((process.env.SITE_URL || "").startsWith("https") ? "https" : "http");
      const secure = proto === "https" ? "; Secure" : "";
      res.setHeader(
        "Set-Cookie",
        `${cookieName(token)}=${encodeURIComponent(cookieGrant)}; HttpOnly; Path=/watch/${token}; SameSite=Lax; Max-Age=${maxAge}${secure}`
      );
      return { redirect: { destination: `/watch/${token}`, permanent: false } };
    }
    // Grant present but invalid/expired — fall through to the email form with a note.
    return {
      props: {
        status: "need-email",
        token,
        title: record.videoTitle,
        notice: "That sign-in link has expired. Enter your email to get a new one.",
      },
    };
  }

  // 2. Returning viewer with a valid cookie grant.
  const cookies = parseCookies(req.headers.cookie);
  const existing = verifyGrant(cookies[cookieName(token)], { token });
  if (existing) {
    // View tracking: additive fields only, so records created before this
    // feature keep working untouched. Counted per authorized page render —
    // never for the email form. Last-writer-wins on concurrent views is
    // acceptable at this scale.
    const now = Date.now();
    await kvSet(`bunnyshare:${token}`, {
      ...record,
      viewCount: (record.viewCount || 0) + 1,
      firstViewedAt: record.firstViewedAt || now,
      lastViewedAt: now,
    });

    const embedUrl = generateEmbedUrl(record.videoId, 3600);
    return { props: { status: "authorized", embedUrl, title: record.videoTitle } };
  }

  // 3. No grant yet — ask for the email.
  return { props: { status: "need-email", token, title: record.videoTitle } };
}

const styles = {
  wrap: { maxWidth: 900, margin: "40px auto", padding: 20, fontFamily: "system-ui, sans-serif" },
  playerBox: { position: "relative", paddingTop: "56.25%" },
  iframe: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 },
  muted: { color: "#57606a" },
  notice: { color: "#9a6700", background: "#fff8c5", padding: "8px 12px", borderRadius: 6 },
  error: { color: "#d1242f" },
  form: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 },
  input: { flex: "1 1 240px", padding: 10, border: "1px solid #ccc", borderRadius: 6, fontSize: 15 },
  btn: { background: "#1f6feb", color: "white", border: 0, padding: "10px 16px", borderRadius: 6, cursor: "pointer", fontSize: 15 },
};
