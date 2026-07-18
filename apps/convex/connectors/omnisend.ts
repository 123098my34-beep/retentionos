// Live Omnisend connector (email + SMS + push). Omnisend uses a static API
// key (X-API-KEY header) against the v3 REST API. Campaigns return
// performance; we aggregate per-day across both channels.
import type { LiveDaily } from "@hiro/shared";
import { addToMap, mapToArray, dateRange } from "./helpers";

const API_BASE = "https://api.omnisend.com/v3";

export async function fetchDailyMetrics(
  apiKey: string,
  days: number,
): Promise<LiveDaily[]> {
  const { start, end, dates } = dateRange(days);
  const map = new Map<string, LiveDaily>();

  // Omnisend returns campaigns with sentAt + performance; paginate.
  let url: string | null = `${API_BASE}/campaigns?limit=100`;
  while (url) {
    const res = await fetch(url, {
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const rows: any[] = json?.campaigns ?? [];
    for (const c of rows) {
      const sent = c.sentAt ?? c.updatedAt;
      const date = sent ? new Date(sent).toISOString().slice(0, 10) : "";
      if (!date) continue;
      if (date < start || date > end) continue;
      const channel: "email" | "sms" = c.channel ?? (c.type === "sms" ? "sms" : "email");
      addToMap(map, date, channel, {
        sends: Number(c.sent ?? c.sends ?? 0),
        opens: Number(c.opened ?? c.opens ?? 0),
        clicks: Number(c.clicked ?? c.clicks ?? 0),
        conversions: Number(c.ordersCount ?? c.conversions ?? 0),
        revenue: Number(c.revenue ?? 0),
      });
    }
    url = json?.meta?.nextLink ?? null;
  }
  for (const d of dates) {
    if (!map.has(`${d}|email`)) addToMap(map, d, "email", {});
    if (!map.has(`${d}|sms`)) addToMap(map, d, "sms", {});
  }
  return mapToArray(map);
}
