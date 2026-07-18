// Live Attentive connector (SMS/MMS). Uses OAuth 2.0 bearer auth, same
// PKCE flow as Klaviyo (auth code grant). The metrics endpoint shape below
// follows Attentive's reporting API; if a field is missing we tolerate it
// and the caller falls back to mock when no token is present.
import type { LiveDaily } from "@hiro/shared";
import { addToMap, mapToArray, dateRange } from "./helpers";

const API_BASE = "https://api.attentive.com/v1";

export async function fetchDailyMetrics(
  accessToken: string,
  days: number,
): Promise<LiveDaily[]> {
  const { start, end, dates } = dateRange(days);
  const map = new Map<string, LiveDaily>();

  // Attentive campaign performance report (daily aggregates).
  const res = await fetch(
    `${API_BASE}/reports/campaigns?startDate=${start}&endDate=${end}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    },
  );
  if (!res.ok) return [];
  const json: any = await res.json();
  const rows: any[] = json?.results ?? json?.data ?? [];
  for (const r of rows) {
    const date = (r.date ?? r.sentDate ?? "").slice(0, 10);
    if (!date) continue;
    addToMap(map, date, "sms", {
      sends: Number(r.sentCount ?? r.sends ?? 0),
      opens: Number(r.openCount ?? r.opens ?? 0),
      clicks: Number(r.clickCount ?? r.clicks ?? 0),
      conversions: Number(r.conversionCount ?? r.conversions ?? 0),
      revenue: Number(r.revenue ?? r.attributedRevenue ?? 0),
      newSubscribers: Number(r.newSubscribers ?? 0),
      unsubscribes: Number(r.unsubscribes ?? 0),
    });
  }
  // Ensure every date has a row (even zeroed) for a clean chart.
  for (const d of dates) if (!map.has(`${d}|sms`)) addToMap(map, d, "sms", {});
  return mapToArray(map);
}
