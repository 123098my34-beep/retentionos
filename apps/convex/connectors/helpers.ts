// Shared connector helpers. Each platform connector maps its native API
// response into our normalized LiveDaily shape. When live credentials are
// absent the caller falls back to the mock adapter, so the UI always has data.

import type { LiveDaily, Channel } from "@hiro/shared";

export function emptyDaily(date: string, channel: Channel): LiveDaily {
  return {
    date,
    channel,
    sends: 0,
    opens: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    spend: 0,
    newSubscribers: 0,
    unsubscribes: 0,
  };
}

// Fill a day map keyed by date with a given metric value (channel-aware).
export function addToMap(
  map: Map<string, LiveDaily>,
  date: string,
  channel: Channel,
  patch: Partial<LiveDaily>,
): void {
  const key = `${date}|${channel}`;
  const cur = map.get(key) ?? emptyDaily(date, channel);
  map.set(key, { ...cur, ...patch });
}

export function mapToArray(map: Map<string, LiveDaily>): LiveDaily[] {
  return Array.from(map.values()).sort((a, b) =>
    a.date === b.date ? 0 : a.date < b.date ? -1 : 1,
  );
}

export function dateRange(days: number): { start: string; end: string; dates: string[] } {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
  }
  return {
    start: out[0],
    end: out[out.length - 1],
    dates: out,
  };
}
