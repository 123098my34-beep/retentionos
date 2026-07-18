import { NextRequest, NextResponse } from "next/server";

// Stores the long-lived refresh token in an HttpOnly cookie so it is never
// exposed to JavaScript (localStorage/XSS). The short-lived session token
// stays in memory on the client and is rotated via `auth.refreshSession`.
//
// POST { refreshToken }          -> set HttpOnly, Secure, SameSite=Lax cookie
// POST { rotate: true, current } -> server reads the HttpOnly refresh cookie,
//      calls Convex auth.refreshSession, returns a fresh sessionToken, and
//      re-sets the rotated refresh cookie. The refresh token never leaves the
//      server.
// DELETE                         -> clear it (logout)

const COOKIE = "hiro_refresh";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days, matches session TTL

// Convex URL + a tiny fetch to refresh sessions without bundling the client.
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Rotation path: the refresh token stays in the HttpOnly cookie and is read
  // here on the server. We never return it to the client.
  if (body?.rotate === true) {
    const refreshToken = req.cookies.get(COOKIE)?.value;
    const current = body?.current;
    if (!refreshToken || !current) {
      return NextResponse.json({ error: "no refresh session" }, { status: 401 });
    }
    try {
      const res = await fetch(`${CONVEX_URL}/api/mutation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: "auth:refreshSession",
          args: { sessionToken: current, refreshToken },
        }),
      });
      const json = await res.json();
      const value = json?.value ?? json?.status?.[0]?.value;
      if (!value?.sessionToken) {
        return NextResponse.json({ error: "refresh failed" }, { status: 401 });
      }
      const out = NextResponse.json({ sessionToken: value.sessionToken });
      out.cookies.set(COOKIE, value.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: MAX_AGE,
      });
      return out;
    } catch (e) {
      return NextResponse.json({ error: "refresh error" }, { status: 500 });
    }
  }

  const token = body?.refreshToken;
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "missing refreshToken" }, { status: 400 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
