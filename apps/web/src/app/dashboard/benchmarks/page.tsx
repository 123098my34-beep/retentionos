"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useOrg } from "@/lib/useOrg";

function fmt(v: number, unit: string) {
  if (unit === "percent") return `${(v * 100).toFixed(1)}%`;
  if (unit === "currency") return `$${v.toFixed(2)}`;
  return `${v.toFixed(1)}x`;
}

export default function BenchmarksPage() {
  const { orgId, token } = useOrg();
  const data = useQuery(
    api.benchmarks.compare,
    orgId && token ? { sessionToken: token, orgId: orgId as any } : "skip",
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Benchmarks</h1>
        <p style={{ color: "#9a9aa2", marginTop: 4 }}>
          See where you stand vs industry medians for retention marketing.
        </p>
        <p style={{ color: "#9a9aa2", marginTop: 4, fontSize: 12 }}>
          Medians are illustrative and refreshed weekly via the benchmark cron
          hook — swap in a live feed through <code>benchmarks.refresh</code>.
        </p>
      </div>

      <div className="card" style={{ overflowX: "auto" }}>
        {!data && "No benchmark data yet."}
        {data && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#9a9aa2" }}>
                <th style={{ padding: 8 }}>Metric</th>
                <th style={{ padding: 8 }}>Your value</th>
                <th style={{ padding: 8 }}>Industry median</th>
                <th style={{ padding: 8 }}>Percentile</th>
              </tr>
            </thead>
            <tbody>
              {data.map((b) => (
                <tr key={b.metric} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: 8 }}>{b.metric}</td>
                  <td style={{ padding: 8, fontWeight: 700 }}>{fmt(b.yourValue, b.unit)}</td>
                  <td style={{ padding: 8 }}>{fmt(b.industryMedian, b.unit)}</td>
                  <td
                    style={{
                      padding: 8,
                      color: b.percentile >= 50 ? "#4ade80" : "#ff6b6b",
                      fontWeight: 700,
                    }}
                  >
                    {b.percentile}th
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
