// Live Yotpo (formerly SMSBump / Yotpo SMS & Email) connector. Yotpo uses a
// static app key + secret (basic auth) against the v3 reporting API. We pull
// daily campaign performance and aggregate per-day across email + SMS into
// our normalized LiveDaily shape. When live credentials are absent the caller
// falls back to the mock adapter, so the UI always has data.
import type { LiveDaily } from "@hiro/shared";
import { addToMap, mapToArray, dateRange } from "./helpers";

const API_BASE = "https://api.yotpo.com/v3";

export async function fetchDailyMetrics(
  apiKey: string,
  days: number,
): Promise<LiveDaily[]> {
  const { start, end, dates } = dateRange(days);
  const map = new Map<string, LiveDaily>();

  // Yotpo campaign reports return rows with a date and per-channel metrics.
  const res = await fetch(
    `${API_BASE}/campaigns/reports?start_date=${start}&end_date=${end}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
    },
  );
  if (!res.ok) return [];
  const json: any = await res.json();
  const rows: any[] = json?.data?.reports ?? json?.reports ?? json?.data ?? [];
  for (const r of rows) {
    const date = (r.date ?? r.report_date ?? "").slice(0, 10);
    if (!date) continue;
    const channel: "email" | "sms" = (r.channel ?? "email") === "sms" ? "sms" : "email";
    addToMap(map, date, channel, {
      sends: Number(r.sent ?? r.sends ?? 0),
      opens: Number(r.opened ?? r.opens ?? 0),
      clicks: Number(r.clicked ?? r.clicks ?? 0),
      conversions: Number(r.conversions ?? r.orders ?? 0),
      revenue: Number(r.revenue ?? r.attributed_revenue ?? 0),
      newSubscribers: Number(r.new_subscribers ?? 0),
      unsubscribes: Number(r.unsubscribes ?? 0),
    });
  }
  for (const d of dates) {
    if (!map.has(`${d}|email`)) addToMap(map, d, "email", {});
    if (!map.has(`${d}|sms`)) addToMap(map, d, "sms", {});
  }
  return mapToArray(map);
}
