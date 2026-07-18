"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useOrg } from "@/lib/useOrg";
import { setSessionToken, setRefreshToken } from "@/lib/convex";
import { useMutation } from "convex/react";
import { api } from "@/lib/api";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, orgId, ready } = useOrg();
  const logout = useMutation(api.auth.logout);

  if (ready && !user) {
    router.replace("/");
    return null;
  }
  if (!ready || !user) {
    return <main style={{ padding: 40 }}>Loading…</main>;
  }

  async function doLogout() {
    const token = (await import("@/lib/convex")).getSessionToken();
    if (token) await logout({ sessionToken: token });
    setSessionToken(null);
    await setRefreshToken(null);
    router.push("/");
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <aside
        style={{
          width: 232,
          borderRight: "1px solid var(--border)",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 18 }}>
          Hiro<span style={{ color: "var(--accent)" }}>.</span>
        </div>
        <NavLink href="/dashboard" label="Overview" />
        <NavLink href="/dashboard/accounts" label="Client Accounts" />
        <NavLink href="/dashboard/campaigns" label="Campaigns" />
        <NavLink href="/dashboard/flows" label="Flows" />
        <NavLink href="/dashboard/cohorts" label="Cohorts" />
        <NavLink href="/dashboard/subscribers" label="Subscribers" />
        <NavLink href="/dashboard/benchmarks" label="Benchmarks" />
        <NavLink href="/dashboard/alerts" label="Alerts" />
        <NavLink href="/dashboard/sources" label="Data Sources" />
        <NavLink href="/dashboard/reports" label="Reports" />
        <div style={{ marginTop: "auto", display: "grid", gap: 8 }}>
          <div style={{ fontSize: 13, color: "#9a9aa2" }}>{user.email}</div>
          <button className="btn" onClick={doLogout}>
            Log out
          </button>
        </div>
      </aside>
      <section style={{ flex: 1, padding: 28, overflow: "auto" }}>
        {children}
      </section>
    </div>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        padding: "9px 12px",
        borderRadius: 9,
        fontSize: 14,
        color: "#cfcfd6",
      }}
      className="navlink"
    >
      {label}
    </Link>
  );
}
