"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/api";
import { useOrg } from "@/lib/useOrg";
import { exportReportCsv } from "@/lib/csv";
import { exportReportPdf } from "@/lib/pdf";

export default function ReportsPage() {
  const { orgId, token } = useOrg();
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("Client Retention Report");
  const reports = useQuery(
    api.reports.list,
    orgId && token ? { sessionToken: token, orgId: orgId as any } : "skip",
  );
  const shares = useQuery(
    api.shares.list,
    orgId && token ? { sessionToken: token, orgId: orgId as any } : "skip",
  );
  const generate = useMutation(api.reports.generate);
  const createShare = useMutation(api.shares.create);

  async function gen() {
    if (!orgId || !token) return;
    setBusy(true);
    try {
      await generate({ sessionToken: token, orgId: orgId as any, periodDays: 30 });
    } finally {
      setBusy(false);
    }
  }

  async function makeShare() {
    if (!orgId || !token) return;
    const res = await createShare({
      sessionToken: token,
      orgId: orgId as any,
      title,
      periodDays: 30,
    });
    const url = `${window.location.origin}/share/${res.token}`;
    window.prompt("Share link (read-only):", url);
  }

  function exportCsv() {
    if (!reports?.length) return;
    exportReportCsv(reports[0]);
  }

  function exportPdf() {
    if (!reports?.length) return;
    exportReportPdf(reports[0]);
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <h1 style={{ margin: 0 }}>Automated Reports</h1>
        <p style={{ color: "#9a9aa2", marginTop: 4 }}>
          Branded, client-ready reports with AI summaries, CSV + PDF export,
          and shareable read-only dashboards.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button className="btn btn-primary" onClick={gen} disabled={busy}>
          {busy ? "Generating…" : "Generate 30-day report"}
        </button>
        <button className="btn" onClick={exportCsv} disabled={!reports?.length}>
          Export CSV
        </button>
        <button className="btn" onClick={exportPdf} disabled={!reports?.length}>
          Export PDF
        </button>
        <input
          className="input"
          style={{ width: 240 }}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button className="btn" onClick={makeShare}>
          Create share link
        </button>
      </div>

      <div style={{ display: "grid", gap: 14 }}>
        {reports?.map((r) => (
          <div key={r.id} className="card">
            <div style={{ fontWeight: 600 }}>{r.title}</div>
            <div style={{ fontSize: 12, color: "#9a9aa2", marginBottom: 8 }}>
              {r.periodStart} → {r.periodEnd}
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>{r.summary}</p>
            <div style={{ fontWeight: 600, marginTop: 8, fontSize: 14 }}>
              Suggested follow-ups
            </div>
            <ul style={{ margin: "6px 0", paddingLeft: 18, fontSize: 14 }}>
              {r.followUps.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        ))}
        {!reports?.length && (
          <div className="card" style={{ color: "#9a9aa2" }}>
            No reports yet — generate one above.
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 10 }}>Share links</div>
        {shares?.length === 0 && (
          <div style={{ color: "#9a9aa2", fontSize: 14 }}>
            No share links yet.
          </div>
        )}
        {shares?.map((s) => (
          <div
            key={s.id}
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
              {s.title}{" "}
              <span style={{ color: "#9a9aa2", fontSize: 12 }}>
                ({s.periodDays}d)
              </span>
            </span>
            <a
              className="btn"
              style={{ padding: "4px 10px", fontSize: 12 }}
              href={`/share/${s.token}`}
              target="_blank"
              rel="noreferrer"
            >
              Open
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
