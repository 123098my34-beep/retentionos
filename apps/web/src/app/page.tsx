"use client";

import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/lib/api";
import { setSessionToken, setRefreshToken } from "@/lib/convex";
import { useRouter } from "next/navigation";

type Mode = "login" | "signup" | "magic";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [magicToken, setMagicToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const login = useMutation(api.auth.login);
  const signup = useMutation(api.auth.signup);
  const requestMagic = useMutation(api.auth.requestMagicLink);
  const verifyMagic = useMutation(api.auth.verifyMagicLink);

  // Auto-redeem a magic link from the URL (?magic=token) — the link emailed
  // by the backend points here.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("magic");
    if (!token) return;
    setBusy(true);
    verifyMagic({ token })
      .then(async (res) => {
        await setRefreshToken(res.refreshToken);
        setSessionToken(res.sessionToken);
        router.push("/dashboard");
      })
      .catch((err) => {
        setError(err?.message ?? "Invalid or expired magic link");
        setBusy(false);
      });
  }, [router, verifyMagic]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const res = await login({ email, password });
        await setRefreshToken(res.refreshToken);
        setSessionToken(res.sessionToken);
        router.push("/dashboard");
      } else if (mode === "signup") {
        const res = await signup({ email, password, name });
        await setRefreshToken(res.refreshToken);
        setSessionToken(res.sessionToken);
        router.push("/dashboard");
      } else {
        const res = await requestMagic({ email });
        // Scaffold: show the token instead of emailing it.
        setInfo(`Magic link token (email this in prod): ${res.token}`);
        setMagicToken(res.token);
      }
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function redeemMagic() {
    setError(null);
    setBusy(true);
    try {
      const res = await verifyMagic({ token: magicToken });
      await setRefreshToken(res.refreshToken);
      setSessionToken(res.sessionToken);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.message ?? "Invalid magic link");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
      }}
    >
      <div className="card" style={{ width: 380, maxWidth: "100%" }}>
        <h1 style={{ margin: "0 0 4px" }}>Hiro Analytics</h1>
        <p style={{ color: "#9a9aa2", marginTop: 0, fontSize: 14 }}>
          Retention marketing analytics hub
        </p>

        <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
          {(["login", "signup", "magic"] as Mode[]).map((m) => (
            <button
              key={m}
              className="btn"
              style={{
                flex: 1,
                padding: 8,
                opacity: mode === m ? 1 : 0.5,
              }}
              onClick={() => {
                setMode(m);
                setError(null);
                setInfo(null);
              }}
            >
              {m === "login" ? "Log in" : m === "signup" ? "Sign up" : "Magic"}
            </button>
          ))}
        </div>

        <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
          {mode === "signup" && (
            <input
              className="input"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          )}
          <input
            className="input"
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {mode !== "magic" && (
            <input
              className="input"
              type="password"
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
          {mode !== "magic" && (
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy ? "..." : mode === "login" ? "Log in" : "Create account"}
            </button>
          )}
          {mode === "magic" && (
            <button className="btn btn-primary" disabled={busy} type="submit">
              {busy ? "..." : "Send magic link"}
            </button>
          )}
        </form>

        {mode === "magic" && magicToken && (
          <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
            <input
              className="input"
              placeholder="Paste magic token"
              value={magicToken}
              onChange={(e) => setMagicToken(e.target.value)}
            />
            <button className="btn" onClick={redeemMagic} disabled={busy}>
              Verify & enter
            </button>
          </div>
        )}

        {error && (
          <p style={{ color: "#ff6b6b", fontSize: 13, marginTop: 12 }}>
            {error}
          </p>
        )}
        {info && (
          <p style={{ color: "#6d5efc", fontSize: 12, marginTop: 12 }}>{info}</p>
        )}
      </div>
    </main>
  );
}
