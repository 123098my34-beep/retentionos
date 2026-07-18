"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useOrg } from "@/lib/useOrg";

export default function AlertsPage() {
  const { orgId, token } = useOrg();
  const [name, setName] = useState("Revenue drop alert");
  const [metric, setMetric] = useState("revenue");
  const [channel, setChannel] = useState("all");
  const [direction, setDirection] = useState("drop");
  const [threshold, setThreshold] = useState(20);

  const alerts = useQuery(
    api.alerts.list,
    orgId && token ? { sessionToken: token, orgId: orgId as any } : "skip",
  );
  const evald = useQuery(
    api.alerts.evaluate,
    orgId && token ? { sessionToken: token, orgId: orgId as any } : "skip",
  );
  const create = useMutation(api.alerts.create);
  const toggle = useMutation(api.alerts.toggle);

  async function add() {
    if (!orgId || !token) return;
    await create({
      sessionToken: token,
      orgId: orgId as any,
      name,
      metric: metric as any,
      channel: channel as any,
      direction: direction as any,
      thresholdPct: threshold / 100,
      cadence: "daily",
    });
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Proactive Alerts</h1>
        <p style={{ color: "#9a9aa2", marginTop: 4 }}>
          Get notified when performance drops off or pacing falls behind target.
        </p>
      </div>

      <div className="card" style={{ display: "grid", gap: 10, maxWidth: 560 }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        <div style={{ display: "flex", gap: 8 }}>
          <select
            className="input"
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
          >
            <option value="revenue">Revenue</option>
            <option value="sends">Sends</option>
            <option value="conversionRate">Conversion rate</option>
            <option value="openRate">Open rate</option>
          </select>
          <select
            className="input"
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
          >
            <option value="all">All channels</option>
            <option value="email">Email</option>
            <option value="sms">SMS</option>
            <option value="push">Push</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#9a9aa2" }}>Alert if drops</span>
          <input
            className="input"
            type="number"
            style={{ width: 80 }}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
          <span style={{ fontSize: 13, color: "#9a9aa2" }}>
            {direction === "drop" ? "% vs prior 7d" : "% under target"}
          </span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#9a9aa2" }}>Type</span>
          <select
            className="input"
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
          >
            <option value="drop">Performance drop</option>
            <option value="below_target">Pacing below target</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={add}>
          Add alert
        </button>
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Current status</div>
        {evald?.map((e) => (
          <div
            key={e.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "8px 0",
              borderTop: "1px solid var(--border)",
              fontSize: 14,
            }}
          >
            <span>{e.name}</span>
            <span style={{ color: e.fired ? "#ff6b6b" : "#4ade80" }}>
              {e.message}
            </span>
          </div>
        ))}
        {!evald && "No alerts configured."}
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Alert rules</div>
        {alerts?.map((a) => (
          <div
            key={a.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "8px 0",
              borderTop: "1px solid var(--border)",
              fontSize: 14,
            }}
          >
            <span>
              {a.name}{" "}
              <span style={{ color: "#9a9aa2", fontSize: 12 }}>
                ({a.metric} · {a.channel} · {(a.thresholdPct * 100).toFixed(0)}%)
              </span>
            </span>
            <button
              className="btn"
              style={{ padding: "4px 10px", fontSize: 12 }}
              onClick={() =>
                toggle({ sessionToken: token!, alertId: a.id as any, enabled: !a.enabled })
              }
            >
              {a.enabled ? "On" : "Off"}
            </button>
          </div>
        ))}
        {!alerts?.length && "None yet."}
      </div>
    </div>
  );
}
