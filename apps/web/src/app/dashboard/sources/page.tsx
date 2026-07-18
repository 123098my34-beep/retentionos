"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useOrg } from "@/lib/useOrg";
import { DATA_SOURCE_LABELS, type DataSourceType } from "@hiro/shared";

const TYPES = Object.keys(DATA_SOURCE_LABELS) as DataSourceType[];

export default function SourcesPage() {
  const { orgId, token, user } = useOrg();
  const [type, setType] = useState<DataSourceType>("klaviyo");
  const [label, setLabel] = useState("Acme Store");
  const [apiKey, setApiKey] = useState("");

  const sources = useQuery(
    api.dataSources.list,
    orgId && token
      ? { sessionToken: token, orgId: orgId as any }
      : "skip",
  );
  const connect = useMutation(api.dataSources.connect);
  const disconnect = useMutation(api.dataSources.disconnect);

  const siteUrl = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  function oauthUrl(platform: string): string {
    if (!siteUrl || !orgId || !user) return "#";
    return `${siteUrl}/oauth/${platform}/start?platform=${platform}&orgId=${orgId}&userId=${user.id}`;
  }

  async function doConnect() {
    if (!orgId || !token) return;
    const needsKey = type === "postscript" || type === "omnisend";
    await connect({
      sessionToken: token,
      orgId: orgId as any,
      type,
      accountLabel: label,
      apiKey: needsKey ? apiKey || undefined : undefined,
    });
  }

  async function doDisconnect(id: string) {
    if (!token) return;
    await disconnect({ sessionToken: token, sourceId: id as any });
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Data Sources</h1>
        <p style={{ color: "#9a9aa2", marginTop: 4 }}>
          Connect your Email & SMS platforms (mock mode: no live credentials
          required)
        </p>
      </div>

      <div className="card" style={{ display: "grid", gap: 12, maxWidth: 460 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TYPES.map((t) => (
            <button
              key={t}
              className="btn"
              style={{
                padding: 8,
                opacity: type === t ? 1 : 0.5,
                borderColor: type === t ? "var(--accent)" : "var(--border)",
              }}
              onClick={() => setType(t)}
            >
              {DATA_SOURCE_LABELS[t]}
            </button>
          ))}
        </div>
        <input
          className="input"
          placeholder="Account label (e.g. Acme Store)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        {(type === "postscript" || type === "omnisend") && (
          <input
            className="input"
            placeholder={`${DATA_SOURCE_LABELS[type]} API key`}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        )}
        <button className="btn btn-primary" onClick={doConnect}>
          Connect {DATA_SOURCE_LABELS[type]} (mock)
        </button>
        {(type === "klaviyo" || type === "attentive") && siteUrl && (
          <a className="btn" href={oauthUrl(type)} style={{ textAlign: "center" }}>
            Connect {DATA_SOURCE_LABELS[type]} with OAuth (live)
          </a>
        )}
        {!siteUrl && (
          <div style={{ fontSize: 12, color: "#9a9aa2" }}>
            Set NEXT_PUBLIC_CONVEX_SITE_URL + KLAVIYO_CLIENT_ID/SECRET to enable
            live OAuth.
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {sources?.length === 0 && (
          <div className="card" style={{ color: "#9a9aa2" }}>
            No sources connected yet.
          </div>
        )}
        {sources?.map((s) => (
          <div
            key={s.id}
            className="card"
            style={{ display: "flex", alignItems: "center", gap: 14 }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 99,
                background:
                  s.status === "connected"
                    ? "#4ade80"
                    : s.status === "syncing"
                      ? "#facc15"
                      : "#ff6b6b",
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div style={{ fontSize: 13, color: "#9a9aa2" }}>
                {s.accountLabel} · {s.status}
                {s.lastSyncedAt
                  ? ` · synced ${new Date(s.lastSyncedAt).toLocaleString()}`
                  : ""}
              </div>
            </div>
            <button className="btn" onClick={() => doDisconnect(s.id)}>
              Disconnect
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
