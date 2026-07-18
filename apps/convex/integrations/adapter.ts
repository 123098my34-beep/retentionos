// Integration adapter layer for Hiro Analytics.
//
// Each marketing platform (Klaviyo, Attentive, Postscript, Omnisend) exposes a
// common interface. In MOCK mode we synthesize realistic daily metrics so the
// UI works end-to-end. To go live, implement the `fetchDailyMetrics` method
// with the platform's real API + OAuth token (stored encrypted out of band).

import type {
  DataSourceType,
  ChannelMetrics,
  Channel,
  CampaignPerformance,
  CohortAnalysis,
  SubscriberFunnel,
  Benchmark,
} from "@hiro/shared";
import { pctile } from "../lib/metrics";

export interface DailyMetricRow {
  date: string; // YYYY-MM-DD
  channel: Channel;
  metrics: ChannelMetrics;
}

export interface SourceAdapter {
  type: DataSourceType;
  // Pull the last `days` days of metrics for the connected account.
  fetchDailyMetrics(accountLabel: string, days: number): Promise<DailyMetricRow[]>;
  // Campaign-level performance (deep dive, filters, compare).
  buildCampaigns(
    accountLabel: string,
    count: number,
  ): Promise<CampaignPerformance[]>;
  // Cohort retention curve for a given cohort label + filters.
  buildCohort(label: string, filters: string[]): Promise<CohortAnalysis>;
  // Flow performance (real in live mode, deterministic mock otherwise).
  buildFlows(accountLabel: string, count: number): Promise<
    {
      name: string;
      channel: Channel;
      revenue: number;
      filteredRevenue: number;
      sends: number;
      conversions: number;
      openRate: number;
      clickRate: number;
      conversionRate: number;
      momRevenue: number;
    }[]
  >;
  // Subscriber -> first purchase funnel.
  buildSubscriberFunnel(): Promise<SubscriberFunnel>;
  // Industry benchmarks for the org's aggregate metrics.
  // medians: optional override of industry medians (live feed). When omitted,
  // the illustrative defaults below are used.
  buildBenchmarks(
    metrics: ChannelMetrics,
    medians?: { metric: string; industryMedian: number; unit: Benchmark["unit"] }[],
  ): Benchmark[];
}

// Deterministic pseudo-random so mock data is stable per (source, day).
function seeded(seed: number): () => number {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashString(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h) || 1;
}

function buildRow(
  type: DataSourceType,
  accountLabel: string,
  date: string,
  channel: Channel,
  rand: () => number,
): DailyMetricRow {
  const isEmail = channel === "email";
  // Each platform has a slightly different scale/blend.
  const baseSpend = (type === "klaviyo" ? 420 : 280) * (isEmail ? 1 : 0.6);
  const spend = Math.round(baseSpend * (0.7 + rand() * 0.6));
  const sends = Math.round(
    (isEmail ? 18000 : 9000) * (0.6 + rand() * 0.8),
  );
  const opens = Math.round(sends * (isEmail ? 0.34 : 0.18) * (0.8 + rand() * 0.4));
  const clicks = Math.round(opens * (isEmail ? 0.12 : 0.09) * (0.7 + rand() * 0.6));
  const conversions = Math.round(clicks * (isEmail ? 0.22 : 0.16) * (0.6 + rand() * 0.8));
  const revenue = Math.round(conversions * (isEmail ? 38 : 52) * (0.7 + rand() * 0.6));
  // ~18-32% of attributed revenue is recurring subscription orders that
  // inflate campaign/flow numbers — Hiro's signature "accurate revenue" fix.
  const recurring = Math.round(revenue * (0.18 + rand() * 0.14));
  const filteredRevenue = Math.max(0, revenue - recurring);
  const newSubs = Math.round(sends * 0.012 * (0.6 + rand()));
  const unsubs = Math.round(sends * 0.004 * (0.6 + rand()));

  const m: ChannelMetrics = {
    revenue,
    filteredRevenue,
    spend,
    sends,
    opens,
    clicks,
    conversions,
    newSubscribers: newSubs,
    unsubscribes: unsubs,
    openRate: sends ? opens / sends : 0,
    clickRate: opens ? clicks / opens : 0,
    ctr: sends ? clicks / sends : 0,
    conversionRate: clicks ? conversions / clicks : 0,
    roi: spend ? (revenue - spend) / spend : 0,
    recurringInflation: revenue ? recurring / filteredRevenue : 0,
  };
  return { date, channel, metrics: m };
}

const CAMPAIGN_NAMES = [
  "Black Friday Blast",
  "Welcome Series v2",
  "Post-Purchase Cross-Sell",
  "Winback — 60d Lapse",
  "Abandoned Cart Reminder",
  "VIP Early Access",
  "Replenishment Nudge",
  "Browse Abandonment",
  "Sunset Flow",
  "Referral Giveaway",
  "Spring Sale Men",
  "Spring Sale Women",
  "BOGO Blazers & Slacks",
  "Back in Stock Alert",
  "Birthday Reward",
];
const CAMPAIGN_TAGS = [
  "sale",
  "promo",
  "men",
  "women",
  "welcome",
  "winback",
  "seasonal",
  "vip",
];

class MockAdapter implements SourceAdapter {
  constructor(public type: DataSourceType) {}
  async fetchDailyMetrics(
    accountLabel: string,
    days: number,
  ): Promise<DailyMetricRow[]> {
    const out: DailyMetricRow[] = [];
    const seedBase = hashString(this.type + accountLabel);
    for (let d = days - 1; d >= 0; d--) {
      const day = new Date(Date.now() - d * 86400000);
      const date = day.toISOString().slice(0, 10);
      const randEmail = seeded(seedBase + d * 2 + 1);
      const randSms = seeded(seedBase + d * 2 + 2);
      out.push(buildRow(this.type, accountLabel, date, "email", randEmail));
      out.push(buildRow(this.type, accountLabel, date, "sms", randSms));
      out.push(buildRow(this.type, accountLabel, date, "push", seeded(seedBase + d * 2 + 3)));
      out.push(buildRow(this.type, accountLabel, date, "whatsapp", seeded(seedBase + d * 2 + 4)));
    }
    return out;
  }

  async buildCampaigns(
    accountLabel: string,
    count: number,
  ): Promise<CampaignPerformance[]> {
    const rand = seeded(hashString(this.type + accountLabel + "campaigns"));
    const out: CampaignPerformance[] = [];
    for (let i = 0; i < count; i++) {
      const name = CAMPAIGN_NAMES[i % CAMPAIGN_NAMES.length];
      const channel: Channel = i % 3 === 0 ? "sms" : "email";
      const isEmail = channel === "email";
      const sends = Math.round((isEmail ? 22000 : 11000) * (0.5 + rand()));
      const opens = Math.round(sends * (isEmail ? 0.36 : 0.2) * (0.7 + rand() * 0.6));
      const clicks = Math.round(opens * (isEmail ? 0.13 : 0.1) * (0.7 + rand() * 0.6));
      const conversions = Math.round(clicks * 0.24 * (0.6 + rand()));
      const revenue = Math.round(conversions * (isEmail ? 41 : 55) * (0.7 + rand() * 0.6));
      const recurring = Math.round(revenue * (0.18 + rand() * 0.14));
      const tagCount = 1 + Math.floor(rand() * 3);
      const tags: string[] = [];
      for (let t = 0; t < tagCount; t++)
        tags.push(CAMPAIGN_TAGS[Math.floor(rand() * CAMPAIGN_TAGS.length)]);
      out.push({
        id: `${this.type}-camp-${i}`,
        name,
        channel,
        tags: Array.from(new Set(tags)),
        sentAt: Date.now() - i * 86400000 * 3,
        revenue,
        filteredRevenue: Math.max(0, revenue - recurring),
        sends,
        opens,
        clicks,
        conversions,
        openRate: sends ? opens / sends : 0,
        clickRate: opens ? clicks / opens : 0,
        conversionRate: clicks ? conversions / clicks : 0,
        aov: conversions ? revenue / conversions : 0,
        creativeColor: `hsl(${Math.floor(rand() * 360)}, 70%, 55%)`,
      });
    }
    return out;
  }

  async buildFlows(
    accountLabel: string,
    count: number,
  ): Promise<
    {
      name: string;
      channel: Channel;
      revenue: number;
      filteredRevenue: number;
      sends: number;
      conversions: number;
      openRate: number;
      clickRate: number;
      conversionRate: number;
      momRevenue: number;
    }[]
  > {
    const rand = seeded(hashString(this.type + accountLabel + "flows"));
    const NAMES = [
      "Welcome Series",
      "Abandoned Cart",
      "Post-Purchase",
      "Winback 60d",
      "Browse Abandonment",
      "Sunset Flow",
      "VIP Early Access",
      "Replenishment",
      "Back in Stock",
      "Birthday Reward",
    ];
    const out = [];
    for (let i = 0; i < count; i++) {
      const name = NAMES[i % NAMES.length];
      const channel: Channel = i % 4 === 0 ? "sms" : i % 4 === 1 ? "push" : "email";
      const isEmail = channel === "email";
      const sends = Math.round((isEmail ? 60000 : 24000) * (0.5 + rand()));
      const opens = Math.round(sends * (isEmail ? 0.4 : 0.22) * (0.8 + rand() * 0.4));
      const clicks = Math.round(opens * (isEmail ? 0.14 : 0.1) * (0.7 + rand() * 0.6));
      const conversions = Math.round(clicks * 0.26 * (0.6 + rand()));
      const revenue = Math.round(conversions * (isEmail ? 44 : 58) * (0.7 + rand() * 0.6));
      const recurring = Math.round(revenue * (0.1 + rand() * 0.1));
      out.push({
        name,
        channel,
        revenue,
        filteredRevenue: Math.max(0, revenue - recurring),
        sends,
        conversions,
        openRate: sends ? opens / sends : 0,
        clickRate: opens ? clicks / opens : 0,
        conversionRate: clicks ? conversions / clicks : 0,
        momRevenue: 0.08 + rand() * 0.25,
      });
    }
    return out.sort((a, b) => b.revenue - a.revenue);
  }

  async buildCohort(label: string, filters: string[]): Promise<CohortAnalysis> {
    const rand = seeded(hashString(this.type + label + filters.join(",")));
    // Cumulative conversion curve decelerating over time (logistic-ish).
    const daysArr = [0, 7, 14, 30, 60, 90];
    const curve = [0.164, 0.2, 0.215, 0.22, 0.222, 0.223];
    const emailShare = 0.4 + rand() * 0.2; // fraction of value from email
    let cum = 0;
    const points = daysArr.map((d, idx) => {
      cum = curve[idx] * (0.9 + rand() * 0.2);
      const totalValue = 80 + idx * 8 + rand() * 20; // $/customer grows w/ tenure
      const emailAttributedValue = totalValue * emailShare;
      return {
        days: d,
        cumulativeConversion: cum,
        emailAttributedValue: Number(emailAttributedValue.toFixed(2)),
        totalValue: Number(totalValue.toFixed(2)),
      };
    });
    return {
      cohortLabel: label,
      filters,
      points,
      emailLiftPerCustomer: Number((points[points.length - 1].emailAttributedValue).toFixed(2)),
      totalValuePerCustomer: Number((points[points.length - 1].totalValue).toFixed(2)),
    };
  }

  async buildSubscriberFunnel(): Promise<SubscriberFunnel> {
    const rand = seeded(hashString(this.type + "funnel"));
    const total = 13000 + Math.floor(rand() * 4000);
    const netNew = Math.round(total * 0.77);
    const byDay: { day: number; cumulative: number; raw: number }[] = [];
    const curve = [0.164, 0.2, 0.21, 0.218, 0.22, 0.222];
    const dayMarkers = [0, 7, 14, 21, 30, 60];
    let prev = 0;
    dayMarkers.forEach((d, idx) => {
      const cum = curve[idx];
      const raw = Math.round(netNew * (cum - prev));
      prev = cum;
      byDay.push({ day: d, cumulative: Number(cum.toFixed(3)), raw });
    });
    const converted = Math.round(netNew * 0.22);
    return {
      totalSubscribers: total,
      netNewProspects: netNew,
      convertedWithin30d: converted,
      emailAttributedConversions: Math.round(converted * 0.56),
      conversionRate: Number((converted / netNew).toFixed(3)),
      byDay,
    };
  }

  buildBenchmarks(
    m: ChannelMetrics,
    medians?: { metric: string; industryMedian: number; unit: Benchmark["unit"] }[],
  ): Benchmark[] {
    // Illustrative defaults; replaced by the live feed via benchmarks.refresh.
    const DEFAULTS = [
      { metric: "Open rate", industryMedian: 0.365, unit: "percent" as const },
      { metric: "Click rate", industryMedian: 0.11, unit: "percent" as const },
      { metric: "Conversion rate", industryMedian: 0.055, unit: "percent" as const },
      { metric: "ROI", industryMedian: 6.5, unit: "ratio" as const },
      { metric: "Revenue / send", industryMedian: 0.42, unit: "currency" as const },
    ];
    const list = medians && medians.length ? medians : DEFAULTS;
    return list.map((b) => {
      const yourValue =
        b.metric === "Open rate"
          ? m.openRate
          : b.metric === "Click rate"
            ? m.clickRate
            : b.metric === "Conversion rate"
              ? m.conversionRate
              : b.metric === "ROI"
                ? m.roi
                : m.sends
                  ? m.filteredRevenue / m.sends
                  : 0;
      return {
        metric: b.metric,
        yourValue,
        industryMedian: b.industryMedian,
        percentile: pctile(yourValue, b.industryMedian),
        unit: b.unit,
      };
    });
  }
}

// Rough percentile helper is imported from ../lib/metrics.

const adapters: Record<DataSourceType, SourceAdapter> = {
  klaviyo: new MockAdapter("klaviyo"),
  attentive: new MockAdapter("attentive"),
  postscript: new MockAdapter("postscript"),
  omnisend: new MockAdapter("omnisend"),
  sendlane: new MockAdapter("sendlane"),
  yotpo: new MockAdapter("yotpo"),
};

export function getAdapter(type: DataSourceType): SourceAdapter {
  return adapters[type];
}
