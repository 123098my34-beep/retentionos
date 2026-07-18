// Live Sendlane connector (email + SMS). Sendlane authenticates with a
// static API key (settings > API) sent as a Bearer token. The analytics
// endpoints return per-campaign performance; we aggregate daily across both
// channels into our normalized LiveDaily shape. When live credentials are
// absent the caller falls back to the mock adapter, so the UI always has data.
import type { LiveDaily } from "@hiro/shared";
import { addToMap, mapToArray, dateRange } from "./helpers";

const API_BASE = "https://a.sendlane.com/api/v1";

export async function fetchDailyMetrics(
  apiKey: string,
  days: number,
): Promise<LiveDaily[]> {
  const { start, end, dates } = dateRange(days);
  const map = new Map<string, LiveDaily>();

  // Sendlane campaign stats are returned per-campaign; paginate.
  let url: string | null = `${API_BASE}/campaigns?per_page=100`;
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const rows: any[] = json?.data ?? json?.campaigns ?? [];
    for (const c of rows) {
      const sent = c.sent_at ?? c.updated_at ?? c.created_at;
      const date = sent ? new Date(sent).toISOString().slice(0, 10) : "";
      if (!date || date < start || date > end) continue;
      const channel: "email" | "sms" = c.channel ?? (c.type === "sms" ? "sms" : "email");
      addToMap(map, date, channel, {
        sends: Number(c.sent ?? c.sends ?? 0),
        opens: Number(c.opened ?? c.opens ?? 0),
        clicks: Number(c.clicked ?? c.clicks ?? 0),
        conversions: Number(c.conversions ?? c.orders ?? 0),
        revenue: Number(c.revenue ?? c.attributed_revenue ?? 0),
        newSubscribers: Number(c.new_subscribers ?? 0),
        unsubscribes: Number(c.unsubscribes ?? 0),
      });
    }
    // Sendlane uses meta.pagination.next_url when more pages exist.
    url = json?.meta?.pagination?.next_url ?? null;
  }
  for (const d of dates) {
    if (!map.has(`${d}|email`)) addToMap(map, d, "email", {});
    if (!map.has(`${d}|sms`)) addToMap(map, d, "sms", {});
  }
  return mapToArray(map);
}
