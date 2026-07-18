"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useOrg } from "@/lib/useOrg";

export default function CampaignsPage() {
  const { orgId, token } = useOrg();
  const [includeTags, setIncludeTags] = useState<string>("");
  const [excludeTags, setExcludeTags] = useState<string>("");
  const [keyword, setKeyword] = useState<string>("");
  const [channel, setChannel] = useState<string>("all");

  const res = useQuery(
    api.campaigns.deepDive,
    orgId && token
      ? {
          sessionToken: token,
          orgId: orgId as any,
          includeTags: includeTags
            ? includeTags.split(",").map((t) => t.trim()).filter(Boolean)
            : undefined,
          excludeTags: excludeTags
            ? excludeTags.split(",").map((t) => t.trim()).filter(Boolean)
            : undefined,
          keyword: keyword || undefined,
          channel: channel === "all" ? undefined : (channel as any),
        }
      : "skip",
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Campaign Deep Dive</h1>
        <p style={{ color: "#9a9aa2", marginTop: 4 }}>
          Isolate any set of campaigns by tags, keyword, or channel — get the
          aggregate instantly and compare like Hiro, but faster.
        </p>
      </div>

      <div className="card" style={{ display: "grid", gap: 10, maxWidth: 720 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {["all", "email", "sms", "push", "whatsapp"].map((c) => (
            <button
              key={c}
              className="btn"
              style={{
                padding: 8,
                opacity: channel === c ? 1 : 0.5,
                borderColor: channel === c ? "var(--accent)" : "var(--border)",
                textTransform: "capitalize",
              }}
              onClick={() => setChannel(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <input
          className="input"
          placeholder="Keyword (e.g. sale, men, promo)"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />
        <input
          className="input"
          placeholder="Include tags (comma separated)"
          value={includeTags}
          onChange={(e) => setIncludeTags(e.target.value)}
        />
        <input
          className="input"
          placeholder="Exclude tags (e.g. women)"
          value={excludeTags}
          onChange={(e) => setExcludeTags(e.target.value)}
        />
      </div>

      {res && (
        <>
          <div
            className="card"
            style={{ display: "flex", gap: 24, flexWrap: "wrap" }}
          >
            <Stat label="Campaigns" value={`${res.aggregated.count}`} />
            <Stat label="Accurate Revenue" value={`$${Math.round(res.aggregated.filteredRevenue).toLocaleString()}`} />
            <Stat label="Attributed Revenue" value={`$${Math.round(res.aggregated.revenue).toLocaleString()}`} />
            <Stat label="Sends" value={res.aggregated.sends.toLocaleString()} />
            <Stat label="Open rate" value={`${(res.aggregated.openRate * 100).toFixed(1)}%`} />
            <Stat label="Conv. rate" value={`${(res.aggregated.conversionRate * 100).toFixed(1)}%`} />
            <Stat label="AOV" value={`$${Math.round(res.aggregated.avgAov)}`} />
          </div>

          <div className="card" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#9a9aa2" }}>
                  <th style={{ padding: 8 }}>Creative</th>
                  <th style={{ padding: 8 }}>Name</th>
                  <th style={{ padding: 8 }}>Tags</th>
                  <th style={{ padding: 8 }}>Ch</th>
                  <th style={{ padding: 8 }}>Sends</th>
                  <th style={{ padding: 8 }}>Open</th>
                  <th style={{ padding: 8 }}>CTR</th>
                  <th style={{ padding: 8 }}>Acc. Rev</th>
                  <th style={{ padding: 8 }}>AOV</th>
                </tr>
              </thead>
              <tbody>
                {res.campaigns.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: 8 }}>
                      <div
                        style={{
                          width: 36,
                          height: 24,
                          borderRadius: 4,
                          background: c.creativeColor,
                        }}
                      />
                    </td>
                    <td style={{ padding: 8 }}>{c.name}</td>
                    <td style={{ padding: 8 }}>
                      {c.tags.map((t) => (
                        <span
                          key={t}
                          style={{
                            fontSize: 11,
                            background: "#1b1b1f",
                            padding: "2px 6px",
                            borderRadius: 6,
                            marginRight: 4,
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </td>
                    <td style={{ padding: 8, textTransform: "capitalize" }}>{c.channel}</td>
                    <td style={{ padding: 8 }}>{c.sends.toLocaleString()}</td>
                    <td style={{ padding: 8 }}>{(c.openRate * 100).toFixed(1)}%</td>
                    <td style={{ padding: 8 }}>{(c.clickRate * 100).toFixed(1)}%</td>
                    <td style={{ padding: 8 }}>${Math.round(c.filteredRevenue).toLocaleString()}</td>
                    <td style={{ padding: 8 }}>${Math.round(c.aov)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#9a9aa2" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
