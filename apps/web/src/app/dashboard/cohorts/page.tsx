"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import { api } from "@/lib/api";
import { useOrg } from "@/lib/useOrg";
import type { Channel } from "@hiro/shared";

export default function CohortsPage() {
  const { orgId, token } = useOrg();
  const [label, setLabel] = useState("First-time purchasers");
  const [filter, setFilter] = useState("Tees, Hats");

  const cohort = useQuery(
    api.cohorts.analyze,
    orgId && token
      ? {
          sessionToken: token,
          orgId: orgId as any,
          label,
          filters: filter ? filter.split(",").map((f) => f.trim()) : [],
        }
      : "skip",
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Cohort Retention</h1>
        <p style={{ color: "#9a9aa2", marginTop: 4 }}>
          See the incremental lift of email on LTV/retention KPIs, filterable by
          any cohort attribute.
        </p>
      </div>

      <div className="card" style={{ display: "grid", gap: 10, maxWidth: 640 }}>
        <input
          className="input"
          placeholder="Cohort label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <input
          className="input"
          placeholder="Filters (comma separated)"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      {cohort && (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <Metric
              label="Email lift / customer"
              value={`$${cohort.emailLiftPerCustomer.toFixed(2)}`}
            />
            <Metric
              label="Total value / customer"
              value={`$${cohort.totalValuePerCustomer.toFixed(2)}`}
            />
            <Metric
              label="Email share"
              value={`${(
                (cohort.emailLiftPerCustomer / cohort.totalValuePerCustomer) *
                100
              ).toFixed(0)}%`}
            />
          </div>

          <div className="card" style={{ height: 280 }}>
            <div style={{ marginBottom: 8, fontWeight: 600 }}>
              Cumulative conversion & value by day
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={cohort.points}>
                <XAxis dataKey="days" tick={{ fontSize: 11 }} stroke="#555" />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 11 }}
                  stroke="#555"
                  width={40}
                  tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 11 }}
                  stroke="#555"
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: "#141416",
                    border: "1px solid #26262a",
                  }}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="cumulativeConversion"
                  name="Cum. conversion"
                  stroke="#ff5a3c"
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="totalValue"
                  name="Total value $"
                  stroke="#6d5efc"
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="emailAttributedValue"
                  name="Email value $"
                  stroke="#4ade80"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: 12, color: "#9a9aa2" }}>
            Filters applied: {cohort.filters.join(", ") || "none"}
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
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
