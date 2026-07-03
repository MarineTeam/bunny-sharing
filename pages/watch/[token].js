import { kvGet } from "../../lib/kv";
import { generateEmbedUrl } from "../../lib/bunny";

export default function WatchPage({ valid, reason, embedUrl, title }) {
  if (!valid) {
    return (
      <div style={styles.wrap}>
        <h2>This link isn't available</h2>
        <p>{reason}</p>
      </div>
    );
  }

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

export async function getServerSideProps({ params }) {
  const { token } = params;
  const record = await kvGet(`bunnyshare:${token}`);

  if (!record) {
    return { props: { valid: false, reason: "Link not found." } };
  }
  if (record.revoked) {
    return { props: { valid: false, reason: "Access to this video has been revoked." } };
  }
  if (Date.now() > record.expiresAt) {
    return { props: { valid: false, reason: "This link has expired." } };
  }

  const embedUrl = generateEmbedUrl(record.videoId, 3600);

  return {
    props: { valid: true, embedUrl, title: record.videoTitle },
  };
}

const styles = {
  wrap: { maxWidth: 900, margin: "40px auto", padding: 20, fontFamily: "system-ui, sans-serif" },
  playerBox: { position: "relative", paddingTop: "56.25%" },
  iframe: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 },
};
