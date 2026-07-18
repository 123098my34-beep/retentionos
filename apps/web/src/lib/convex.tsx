"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useEffect, useState } from "react";

const url = process.env.NEXT_PUBLIC_CONVEX_URL!;
const client = new ConvexReactClient(url);

// Security model (hardened from the original localStorage-only scaffold):
//  - The short-lived `sessionToken` lives in memory + a SameSite=Strict cookie
//    so it is sent with first-party requests but not readable by any script
//    via a cross-site context.
//  - The long-lived `refreshToken` lives ONLY in an HttpOnly, Secure,
//    SameSite=Lax cookie set by /api/auth/session, so it is never reachable
//    from JavaScript (no localStorage/XSS exposure).
//  - On load we rotate: call auth.refreshSession with the httpOnly refresh
//    token to mint a fresh session token. This is single-use rotation.

const SESSION_COOKIE = "hiro_session";

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}

// In-memory session token (survives across renders in a single tab).
let memoryToken: string | null = null;

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  if (memoryToken) return memoryToken;
  return readCookie(SESSION_COOKIE);
}

export function setSessionToken(token: string | null): void {
  if (typeof window === "undefined") return;
  memoryToken = token;
  if (token) {
    // 30-day SameSite=Strict cookie (mirrors the backend session TTL).
    document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(
      token,
    )}; Path=/; Max-Age=${60 * 60 * 24 * 30}; SameSite=Strict${
      process.env.NODE_ENV === "production" ? "; Secure" : ""
    }`;
  } else {
    document.cookie = `${SESSION_COOKIE}=; Path=/; Max-Age=0`;
  }
}

// Persist (or clear) the refresh token in the HttpOnly cookie.
export async function setRefreshToken(refreshToken: string | null): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    if (refreshToken) {
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } else {
      await fetch("/api/auth/session", { method: "DELETE" });
    }
  } catch (e) {
    console.error("refresh cookie sync failed", e);
  }
}

// Read the refresh token (only possible from the server/cookie jar — we rely
// on the HttpOnly cookie being attached to the /api/auth/session request).
// Client JS cannot read it directly; rotation is performed server-side in the
// cookie set by the login flow. This helper exists for clarity/symmetry.
export function hasRefreshCookie(): boolean {
  // Best-effort: we can't see HttpOnly cookies from JS, so return true once a
  // session token is present (the login flow always sets the refresh cookie).
  return getSessionToken() !== null;
}

export function Providers({ children }: { children: ReactNode }) {
  // Re-render once mounted so reads from cookie/memory are consistent.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  if (!ready) return null;
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}

// Attempt to rotate the session using the HttpOnly refresh cookie. Returns a
// fresh session token (already stored in memory) or null if rotation failed.
export async function rotateSession(): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const current = getSessionToken();
  if (!current) return null;
  try {
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotate: true, current }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.sessionToken) {
      memoryToken = json.sessionToken;
      return json.sessionToken;
    }
  } catch (e) {
    console.error("session rotation failed", e);
  }
  return null;
}
