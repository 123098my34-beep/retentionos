"use client";

import { useQuery } from "convex/react";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { useOrg } from "@/lib/useOrg";

export default function SubscribersPage() {
  const { orgId, token } = useOrg();
  const funnel = useQuery(
    api.subscribers.funnel,
    orgId && token ? { sessionToken: token, orgId: orgId as any } : "skip",
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Subscriber → First Purchase</h1>
        <p style={{ color: "#9a9aa2", marginTop: 4 }}>
          How many subscribers convert, when, and how many are attributed to
          email. The real "devil in the details" metric.
        </p>
      </div>

      {!funnel && <div className="card">No funnel data yet.</div>}

      {funnel && (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Metric label="Total subscribers" value={funnel.totalSubscribers.toLocaleString()} />
            <Metric label="Net-new prospects" value={funnel.netNewProspects.toLocaleString()} />
            <Metric
              label="Converted ≤30d"
              value={`${funnel.convertedWithin30d.toLocaleString()} (${(
                funnel.conversionRate * 100
              ).toFixed(1)}%)`}
            />
            <Metric
              label="Email-attributed"
              value={funnel.emailAttributedConversions.toLocaleString()}
            />
          </div>

          <div className="card" style={{ height: 280 }}>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              Cumulative conversion by days since subscribe
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={funnel.byDay}>
                <defs>
                  <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6d5efc" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#6d5efc" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#555" />
                <YAxis
                  tick={{ fontSize: 11 }}
                  stroke="#555"
                  width={40}
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#141416",
                    border: "1px solid #26262a",
                  }}
                  formatter={(v: number) => `${(v * 100).toFixed(1)}%`}
                />
                <Area
                  type="monotone"
                  dataKey="cumulative"
                  stroke="#6d5efc"
                  fill="url(#gf)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ minWidth: 200 }}>
      <div style={{ fontSize: 12, color: "#9a9aa2" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
