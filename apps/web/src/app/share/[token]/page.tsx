"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";

function fmt(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

export default function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const data = useQuery(api.shares.getShared, { token });

  if (data === undefined) {
    return <main style={{ padding: 40 }}>Loading shared dashboard…</main>;
  }
  if (data === null) {
    return (
      <main style={{ padding: 40 }}>
        <h1>Link not found</h1>
        <p style={{ color: "#9a9aa2" }}>
          This share link is invalid or has been removed.
        </p>
      </main>
    );
  }

  const m = data.metrics;
  return (
    <main style={{ padding: 32, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <span style={{ fontWeight: 800, fontSize: 22 }}>
          Hiro<span style={{ color: "var(--accent)" }}>.</span>
        </span>
        <span style={{ color: "#9a9aa2", fontSize: 13 }}>shared report</span>
      </div>
      <h1 style={{ margin: "4px 0" }}>{data.title}</h1>
      <p style={{ color: "#9a9aa2", marginTop: 0 }}>
        Last {data.periodDays} days · read-only
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: 12,
          margin: "20px 0",
        }}
      >
        <Card label="Accurate Revenue" value={fmt(m.filteredRevenue)} />
        <Card label="Attributed Revenue" value={fmt(m.revenue)} />
        <Card label="Sends" value={m.sends.toLocaleString()} />
        <Card label="Conversions" value={m.conversions.toLocaleString()} />
        <Card label="Open rate" value={`${(m.openRate * 100).toFixed(1)}%`} />
        <Card label="Conv. rate" value={`${(m.conversionRate * 100).toFixed(1)}%`} />
      </div>

      <div className="card" style={{ color: "#9a9aa2", fontSize: 13 }}>
        Powered by Hiro Analytics — retention marketing insights.
      </div>
    </main>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div style={{ fontSize: 12, color: "#9a9aa2" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, margin: "4px 0" }}>{value}</div>
    </div>
  );
}
