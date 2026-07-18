"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useOrg } from "@/lib/useOrg";

function paceColor(p: number) {
  if (p >= 1) return "#4ade80";
  if (p >= 0.9) return "#facc15";
  return "#ff6b6b";
}

export default function AccountsPage() {
  const { orgId, token } = useOrg();
  const data = useQuery(
    api.accounts.pacing,
    orgId && token ? { sessionToken: token, orgId: orgId as any } : "skip",
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Client Accounts</h1>
        <p style={{ color: "#9a9aa2", marginTop: 4 }}>
          Monitor every client account at a glance, pacing to target and vs
          prior period. Triage underperformers proactively.
        </p>
      </div>

      {data && (
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <div className="card" style={{ minWidth: 200 }}>
            <div style={{ fontSize: 12, color: "#9a9aa2" }}>Org revenue (30d)</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>
              ${Math.round(data.orgTotal).toLocaleString()}
            </div>
          </div>
          <div className="card" style={{ minWidth: 200 }}>
            <div style={{ fontSize: 12, color: "#9a9aa2" }}>Org pace to target</div>
            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: paceColor(data.orgPacePct),
              }}
            >
              {(data.orgPacePct * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ overflowX: "auto" }}>
        {!data && "No accounts."}
        {data && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#9a9aa2" }}>
                <th style={{ padding: 8 }}>Account</th>
                <th style={{ padding: 8 }}>Type</th>
                <th style={{ padding: 8 }}>Revenue (30d)</th>
                <th style={{ padding: 8 }}>MoM</th>
                <th style={{ padding: 8 }}>Target</th>
                <th style={{ padding: 8 }}>Pace</th>
              </tr>
            </thead>
            <tbody>
              {data.accounts.map((a) => (
                <tr key={a.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: 8 }}>{a.accountLabel}</td>
                  <td style={{ padding: 8, textTransform: "capitalize" }}>{a.type}</td>
                  <td style={{ padding: 8 }}>${Math.round(a.revenue).toLocaleString()}</td>
                  <td
                    style={{
                      padding: 8,
                      color: a.momPct >= 0 ? "#4ade80" : "#ff6b6b",
                    }}
                  >
                    {(a.momPct * 100).toFixed(1)}%
                  </td>
                  <td style={{ padding: 8 }}>${Math.round(a.target).toLocaleString()}</td>
                  <td style={{ padding: 8, color: paceColor(a.pacePct), fontWeight: 700 }}>
                    {(a.pacePct * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && data.underperforming.length > 0 && (
          <div style={{ marginTop: 12, color: "#ff6b6b", fontSize: 13 }}>
            ⚠ Underperforming (&lt;90% pace): {data.underperforming.join(", ")}
          </div>
        )}
      </div>
    </div>
  );
}
