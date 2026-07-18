"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useOrg } from "@/lib/useOrg";

export default function FlowsPage() {
  const { orgId, token } = useOrg();
  const data = useQuery(
    api.integrations.dashboard,
    orgId && token
      ? { sessionToken: token, orgId: orgId as any, days: 30 }
      : "skip",
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Flow Performance</h1>
        <p style={{ color: "#9a9aa2", marginTop: 4 }}>
          Track how new flows perform vs old ones on every key metric, across
          any timeframe.
        </p>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        {!data && "Connect a data source to populate flow metrics."}
        {data && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#9a9aa2" }}>
                <th style={{ padding: 8 }}>Flow</th>
                <th style={{ padding: 8 }}>Channel</th>
                <th style={{ padding: 8 }}>Acc. Revenue</th>
                <th style={{ padding: 8 }}>Sends</th>
                <th style={{ padding: 8 }}>Open</th>
                <th style={{ padding: 8 }}>Click</th>
                <th style={{ padding: 8 }}>Conv.</th>
                <th style={{ padding: 8 }}>MoM</th>
              </tr>
            </thead>
            <tbody>
              {data.topFlows.map((f) => (
                <tr key={f.id} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: 8 }}>{f.name}</td>
                  <td style={{ padding: 8, textTransform: "capitalize" }}>{f.channel}</td>
                  <td style={{ padding: 8 }}>${Math.round(f.filteredRevenue).toLocaleString()}</td>
                  <td style={{ padding: 8 }}>{f.sends.toLocaleString()}</td>
                  <td style={{ padding: 8 }}>{(f.openRate * 100).toFixed(1)}%</td>
                  <td style={{ padding: 8 }}>{(f.clickRate * 100).toFixed(1)}%</td>
                  <td style={{ padding: 8 }}>{(f.conversionRate * 100).toFixed(1)}%</td>
                  <td style={{ padding: 8, color: "#4ade80" }}>
                    +{(f.momRevenue * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
