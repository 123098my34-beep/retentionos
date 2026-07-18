// Live Postscript connector (SMS/MMS). Postscript authenticates with a
// bearer API token (settings > API keys). Campaign/automation analytics are
// returned per-message-type; we map daily aggregates into LiveDaily.
import type { LiveDaily } from "@hiro/shared";
import { addToMap, mapToArray, dateRange } from "./helpers";

const API_BASE = "https://api.postscript.io/api/v1";

export async function fetchDailyMetrics(
  apiKey: string,
  days: number,
): Promise<LiveDaily[]> {
  const { start, end, dates } = dateRange(days);
  const map = new Map<string, LiveDaily>();

  const res = await fetch(
    `${API_BASE}/analytics/messages?start_date=${start}&end_date=${end}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "x-postscript-token": apiKey,
      },
    },
  );
  if (!res.ok) return [];
  const json: any = await res.json();
  const rows: any[] = json?.data ?? json?.analytics ?? [];
  for (const r of rows) {
    const date = (r.date ?? "").slice(0, 10);
    if (!date) continue;
    addToMap(map, date, "sms", {
      sends: Number(r.sent ?? r.sends ?? 0),
      opens: Number(r.opened ?? r.opens ?? 0),
      clicks: Number(r.clicked ?? r.clicks ?? 0),
      conversions: Number(r.converted ?? r.conversions ?? 0),
      revenue: Number(r.revenue ?? 0),
      newSubscribers: Number(r.subscribers ?? 0),
      unsubscribes: Number(r.unsubscribes ?? 0),
    });
  }
  for (const d of dates) if (!map.has(`${d}|sms`)) addToMap(map, d, "sms", {});
  return mapToArray(map);
}
