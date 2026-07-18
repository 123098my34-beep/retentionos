"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { getSessionToken, rotateSession } from "@/lib/convex";

export function useSession() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => setToken(getSessionToken()), []);

  const user = useQuery(
    api.auth.me,
    token ? { sessionToken: token } : "skip",
  );

  // If a session token is present but the backend rejects it (expired),
  // rotate once via the HttpOnly refresh cookie.
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current || !token || user !== null) return;
    tried.current = true;
    rotateSession().then((next) => {
      if (next) setToken(next);
    });
  }, [token, user]);

  return { user: user ?? null, token };
}
