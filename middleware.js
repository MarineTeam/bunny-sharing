import { NextResponse } from "next/server";

// Protects the admin page and its API routes with HTTP Basic Auth.
// The /watch/[token] page is NOT covered, so recipients can open their link freely.
export function middleware(req) {
  const auth = req.headers.get("authorization");
  const user = process.env.ADMIN_USER;
  const pass = process.env.ADMIN_PASS;

  if (auth) {
    const [, encoded] = auth.split(" ");
    const decoded = Buffer.from(encoded, "base64").toString();
    const idx = decoded.indexOf(":");
    const u = decoded.slice(0, idx);
    const p = decoded.slice(idx + 1);
    if (u === user && p === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Admin"' },
  });
}

export const config = {
  matcher: ["/", "/api/:path*"],
};
