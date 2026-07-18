"use client";

import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useOrg } from "@/lib/useOrg";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardSummary, ChannelMetrics } from "@hiro/shared";

function pct(cur: number, prev: number): string {
  if (!prev) return cur ? "+100%" : "—";
  return `${(((cur - prev) / prev) * 100).toFixed(1)}%`;
}

function fmtMoney(n: number): string {
  return `$${Math.round(n).toLocaleString()}`;
}

function Kpi({
  label,
  value,
  delta,
}: {
  label: string;
  value: string;
  delta?: string;
}) {
  return (
    <div className="card">
      <div style={{ fontSize: 13, color: "#9a9aa2" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, margin: "6px 0" }}>
        {value}
      </div>
      {delta && (
        <div
          style={{
            fontSize: 12,
            color: delta.startsWith("-") ? "#ff6b6b" : "#4ade80",
          }}
        >
          {delta} vs prev period
        </div>
      )}
    </div>
  );
}

export default function OverviewPage() {
  const { orgId, token } = useOrg();
  const data = useQuery(
    api.integrations.dashboard,
    orgId && token
      ? { sessionToken: token, orgId: orgId as any, days: 30 }
      : "skip",
  ) as DashboardSummary | undefined;

  // Accurate-revenue differentiator: how much subscription-order inflation we
  // recovered vs a naive "raw attributed revenue" view (Hiro's headline edge).
  const inflation = useQuery(
    api.integrations.inflation,
    orgId && token
      ? { sessionToken: token, orgId: orgId as any, days: 30 }
      : "skip",
  );

  const m: ChannelMetrics | undefined = data?.metrics;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Overview</h1>
        <p style={{ color: "#9a9aa2", marginTop: 4 }}>
          Email & SMS performance across all connected sources
        </p>
      </div>

      {!data && (
        <div className="card">Loading analytics… (connect a source to see data)</div>
      )}

      {data && m && (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 14,
            }}
          >
            <Kpi
              label="Revenue (attributed)"
              value={fmtMoney(m.revenue)}
              delta={pct(m.revenue, data.previousMetrics.revenue)}
            />
            <Kpi
              label="Accurate Revenue"
              value={fmtMoney(m.filteredRevenue)}
              delta={pct(
                m.filteredRevenue,
                data.previousMetrics.filteredRevenue,
              )}
            />
            {m.recurringInflation > 0 && (
              <div
                className="card"
                style={{ gridColumn: "span 1", borderColor: "#facc15" }}
              >
                <div style={{ fontSize: 13, color: "#9a9aa2" }}>
                  Recurring inflation
                </div>
                <div
                  style={{ fontSize: 22, fontWeight: 700, margin: "6px 0", color: "#facc15" }}
                >
                  +{((m.recurringInflation || 0) * 100).toFixed(0)}%
                </div>
                <div style={{ fontSize: 12, color: "#9a9aa2" }}>
                  subscription orders inflating totals
                </div>
              </div>
            )}
            <Kpi
              label="Spend"
              value={fmtMoney(m.spend)}
              delta={pct(m.spend, data.previousMetrics.spend)}
            />
            <Kpi
              label="Sends"
              value={m.sends.toLocaleString()}
              delta={pct(m.sends, data.previousMetrics.sends)}
            />
            <Kpi
              label="Conversions"
              value={m.conversions.toLocaleString()}
              delta={pct(m.conversions, data.previousMetrics.conversions)}
            />
            <Kpi
              label="ROI"
              value={`${((m.roi || 0) * 100).toFixed(0)}%`}
              delta={pct(m.roi, data.previousMetrics.roi)}
            />
          </div>

          {inflation && (
            <div
              className="card"
              style={{
                borderColor: "#6d5efc",
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                gap: 14,
              }}
            >
              <div>
                <div style={{ fontSize: 13, color: "#9a9aa2" }}>
                  Recurring inflation recovered
                </div>
                <div
                  style={{ fontSize: 26, fontWeight: 700, margin: "6px 0", color: "#6d5efc" }}
                >
                  +{inflation.recurringInflationPct.toFixed(0)}%
                </div>
                <div style={{ fontSize: 12, color: "#9a9aa2" }}>
                  of raw totals were subscription orders inflating ROI
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#9a9aa2" }}>Raw revenue</div>
                <div style={{ fontSize: 20, fontWeight: 700, margin: "6px 0" }}>
                  {fmtMoney(inflation.rawRevenue)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#9a9aa2" }}>
                  Accurate revenue (filtered)
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, margin: "6px 0", color: "#4ade80" }}>
                  {fmtMoney(inflation.accurateRevenue)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 13, color: "#9a9aa2" }}>
                  Revenue we recovered
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, margin: "6px 0" }}>
                  {fmtMoney(inflation.recoveredRevenue)}
                </div>
              </div>
            </div>
          )}

          <div className="card" style={{ height: 260 }}>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>Revenue trend</div>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={data.revenueSeries}>
                <defs>
                  <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff5a3c" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#ff5a3c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#555" />
                <YAxis tick={{ fontSize: 11 }} stroke="#555" width={48} />
                <Tooltip
                  contentStyle={{ background: "#141416", border: "1px solid #26262a" }}
                  formatter={(v: number) => fmtMoney(v)}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#ff5a3c"
                  fill="url(#g)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 14,
            }}
          >
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 10 }}>Top Flows</div>
              {data.topFlows.map((f) => (
                <div
                  key={f.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderTop: "1px solid var(--border)",
                    fontSize: 14,
                  }}
                >
                  <span>
                    {f.name}{" "}
                    <span style={{ color: "#9a9aa2", fontSize: 12 }}>
                      ({f.channel})
                    </span>
                  </span>
                  <span style={{ color: "#4ade80" }}>
                    {fmtMoney(f.revenue)}
                  </span>
                </div>
              ))}
            </div>
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 10 }}>
                Top Campaigns
              </div>
              {data.topCampaigns.map((c) => (
                <div
                  key={c.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderTop: "1px solid var(--border)",
                    fontSize: 14,
                  }}
                >
                  <span>{c.name}</span>
                  <span style={{ color: "#4ade80" }}>{fmtMoney(c.revenue)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 10 }}>
              Channel breakdown
            </div>
            {(["email", "sms", "push", "whatsapp"] as const).map((ch) => {
              const cm = data.channelBreakdown[ch as "email" | "sms"];
              if (!cm || !cm.sends) return null;
              return (
                <div
                  key={ch}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "6px 0",
                    borderTop: "1px solid var(--border)",
                    fontSize: 14,
                  }}
                >
                  <span style={{ textTransform: "capitalize" }}>{ch}</span>
                  <span style={{ color: "#9a9aa2" }}>
                    {fmtMoney(cm.filteredRevenue)} ·{" "}
                    {((cm.openRate || 0) * 100).toFixed(1)}% open ·{" "}
                    {((cm.conversionRate || 0) * 100).toFixed(1)}% conv
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
