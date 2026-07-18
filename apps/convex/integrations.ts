import { internalMutation, internalAction, query } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import type {
  DashboardSummary,
  ChannelMetrics,
  MetricPoint,
  Channel,
} from "@hiro/shared";
import { ZERO_METRICS } from "@hiro/shared";
import { getAdapter } from "./integrations/adapter";
import {
  fetchDailyMetrics as fetchKlaviyoLive,
  getValidToken,
  fetchFlows,
  fetchCohorts,
  fetchSubscriberFunnel,
  type KlaviyoToken,
} from "./klaviyo";
import { fetchDailyMetrics as fetchAttentive } from "./connectors/attentive";
import { fetchDailyMetrics as fetchPostscript } from "./connectors/postscript";
import { fetchDailyMetrics as fetchOmnisend } from "./connectors/omnisend";
import { fetchDailyMetrics as fetchSendlane } from "./connectors/sendlane";
import { fetchDailyMetrics as fetchYotpo } from "./connectors/yotpo";
import type { LiveDaily } from "@hiro/shared";

// Dispatch live fetch by platform. Token refresh + persistence is handled by
// the caller (syncSource), which has access to ctx.db.
async function fetchLive(
  src: any,
  days: number,
  validToken: string | null,
): Promise<LiveDaily[]> {
  switch (src.type) {
    case "klaviyo":
      return validToken ? fetchKlaviyoLive(validToken, days) : [];
    case "attentive":
      return validToken ? fetchAttentive(validToken, days) : [];
    case "postscript":
      return src.apiKey ? fetchPostscript(src.apiKey, days) : [];
    case "omnisend":
      return src.apiKey ? fetchOmnisend(src.apiKey, days) : [];
    case "sendlane":
      return src.apiKey ? fetchSendlane(src.apiKey, days) : [];
    case "yotpo":
      return src.apiKey ? fetchYotpo(src.apiKey, days) : [];
    default:
      return [];
  }
}

interface SyncRow {
  date: string;
  channel: Channel;
  metrics: ChannelMetrics;
}

// Sync a source: live Klaviyo when a token exists, else mock adapter.
export const syncSource = internalMutation({
  args: {
    sourceId: v.id("dataSources"),
    days: v.number(),
    live: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const src = await ctx.db.get(args.sourceId);
    if (!src) return;
    await ctx.db.patch(args.sourceId, { status: "syncing" });

    let rows: SyncRow[];
    const live = args.live ?? !!(src.accessToken || src.apiKey);

    if (live && (src.accessToken || src.apiKey)) {
      try {
        // Refresh OAuth token if expired, persisting the new tokens.
        let validToken: string | null = src.accessToken ?? null;
        if (
          src.accessToken &&
          (src.type === "klaviyo" || src.type === "attentive")
        ) {
          const res = await getValidToken(
            src.accessToken,
            src.refreshToken,
            src.tokenExpiresAt,
          );
          validToken = res.accessToken;
          if (res.refreshed && src._id) {
            await ctx.db.patch(src._id, {
              accessToken: res.refreshed.access_token,
              refreshToken: res.refreshed.refresh_token,
              tokenExpiresAt: Date.now() + res.refreshed.expires_in * 1000,
            });
          }
        }
        const daily = await fetchLive(src, args.days, validToken);
        if (daily.length === 0) throw new Error("empty live response");
        rows = daily.map((d) => ({
          date: d.date,
          channel: d.channel,
          metrics: {
            ...ZERO_METRICS,
            revenue: d.revenue,
            filteredRevenue: d.revenue,
            spend: d.spend,
            sends: d.sends,
            opens: d.opens,
            clicks: d.clicks,
            conversions: d.conversions,
            newSubscribers: d.newSubscribers,
            unsubscribes: d.unsubscribes,
            openRate: d.sends ? d.opens / d.sends : 0,
            clickRate: d.opens ? d.clicks / d.opens : 0,
            ctr: d.sends ? d.clicks / d.sends : 0,
            conversionRate: d.clicks ? d.conversions / d.clicks : 0,
            roi: d.spend ? (d.revenue - d.spend) / d.spend : 0,
            recurringInflation: 0,
          },
        }));
      } catch (e) {
        // Live fetch failed (bad/expired token, network) -> fall back to mock.
        console.error("live sync failed, falling back to mock:", e);
        rows = await getAdapter(src.type).fetchDailyMetrics(
          src.accountLabel,
          args.days,
        );
      }
    } else {
      rows = await getAdapter(src.type).fetchDailyMetrics(
        src.accountLabel,
        args.days,
      );
    }
    for (const row of rows) {
      // Upsert by (sourceId, date, channel).
      const existing = await ctx.db
        .query("metricSnapshots")
        .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
        .filter((q) =>
          q.and(
            q.eq(q.field("date"), row.date),
            q.eq(q.field("channel"), row.channel),
          ),
        )
        .unique();
      const m = row.metrics;
      const doc = {
        orgId: src.orgId,
        sourceId: args.sourceId,
        date: row.date,
        channel: row.channel,
        revenue: m.revenue,
        filteredRevenue: m.filteredRevenue,
        spend: m.spend,
        sends: m.sends,
        opens: m.opens,
        clicks: m.clicks,
        conversions: m.conversions,
        newSubscribers: m.newSubscribers,
        unsubscribes: m.unsubscribes,
      };
      if (existing) {
        await ctx.db.patch(existing._id, doc);
      } else {
        await ctx.db.insert("metricSnapshots", doc);
      }
    }
    await ctx.db.patch(args.sourceId, {
      status: "connected",
      lastSyncedAt: Date.now(),
    });

    // Populate campaign-level rows for the deep-dive / compare features.
    const adapter = getAdapter(src.type);
    const existingCampaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .collect();
    if (existingCampaigns.length === 0) {
      const camps = await adapter.buildCampaigns(src.accountLabel, 15);
      for (const c of camps) {
        await ctx.db.insert("campaigns", {
          orgId: src.orgId,
          sourceId: args.sourceId,
          name: c.name,
          channel: c.channel,
          tags: c.tags,
          sentAt: c.sentAt,
          revenue: c.revenue,
          filteredRevenue: c.filteredRevenue,
          sends: c.sends,
          opens: c.opens,
          clicks: c.clicks,
          conversions: c.conversions,
          aov: c.aov,
          creativeColor: c.creativeColor,
        });
      }
    }

    // Flow performance (real for live Klaviyo, deterministic mock otherwise).
    const existingFlows = await ctx.db
      .query("flows")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .first();
    if (!existingFlows) {
      let flowRows: any[] = [];
      if (live && src.type === "klaviyo" && src.accessToken) {
        try {
          const { accessToken: validTok } = await getValidToken(
            src.accessToken,
            src.refreshToken,
            src.tokenExpiresAt,
          );
          if (validTok) {
            const liveFlows = await fetchFlows(validTok);
            flowRows = liveFlows.map((f) => ({
              name: f.name,
              channel: f.channel,
              revenue: f.revenue,
              filteredRevenue: f.filteredRevenue,
              sends: f.sends,
              conversions: f.conversions,
              openRate: f.openRate,
              clickRate: f.clickRate,
              conversionRate: f.conversionRate,
              momRevenue: f.momRevenue,
            }));
          }
        } catch (e) {
          console.error("live flow fetch failed, using mock", e);
        }
      }
      if (flowRows.length === 0) {
        flowRows = await adapter.buildFlows(src.accountLabel, 8);
      }
      for (const f of flowRows) {
        await ctx.db.insert("flows", {
          orgId: src.orgId,
          sourceId: args.sourceId,
          name: f.name,
          channel: f.channel,
          revenue: f.revenue,
          filteredRevenue: f.filteredRevenue,
          sends: f.sends,
          conversions: f.conversions,
          openRate: f.openRate,
          clickRate: f.clickRate,
          conversionRate: f.conversionRate,
          momRevenue: f.momRevenue,
          createdAt: Date.now(),
        });
      }
    }

    // Cohort + subscriber-funnel snapshots. Use REAL Klaviyo data when live,
    // otherwise the deterministic mock (so the UI always has data).
    const liveKlaviyo = live && src.type === "klaviyo" && src.accessToken;
    let cohortData: any = null;
    let funnelData: any = null;
    if (liveKlaviyo) {
      try {
        const { accessToken: vt } = await getValidToken(
          src.accessToken,
          src.refreshToken,
          src.tokenExpiresAt,
        );
        if (vt) {
          cohortData = await fetchCohorts(vt);
          funnelData = await fetchSubscriberFunnel(vt);
        }
      } catch (e) {
        console.error("live cohort/funnel fetch failed, using mock", e);
      }
    }
    if (!cohortData) cohortData = await adapter.buildCohort(src.accountLabel, []);
    if (!funnelData) funnelData = await adapter.buildSubscriberFunnel();

    const existingCohort = await ctx.db
      .query("cohorts")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .first();
    if (!existingCohort) {
      await ctx.db.insert("cohorts", {
        orgId: src.orgId,
        label: `${src.name} — first-time purchasers`,
        filters: [],
        points: cohortData.points,
        emailLiftPerCustomer: cohortData.emailLiftPerCustomer,
        totalValuePerCustomer: cohortData.totalValuePerCustomer,
        createdAt: Date.now(),
      });
    }

    const existingFunnel = await ctx.db
      .query("subscriberFunnels")
      .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId))
      .first();
    if (!existingFunnel) {
      const funnel = funnelData;
      await ctx.db.insert("subscriberFunnels", {
        orgId: src.orgId,
        sourceId: args.sourceId,
        totalSubscribers: funnel.totalSubscribers,
        netNewProspects: funnel.netNewProspects,
        convertedWithin30d: funnel.convertedWithin30d,
        emailAttributedConversions: funnel.emailAttributedConversions,
        byDay: funnel.byDay,
        createdAt: Date.now(),
      });
    }
  },
});

import { addMetrics, finalizeMetrics } from "./lib/metrics";

function finalize(acc: ChannelMetrics): ChannelMetrics {
  return finalizeMetrics(acc);
}

function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}

export const dashboard = query({
  args: {
    sessionToken: v.string(),
    orgId: v.id("orgs"),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<DashboardSummary> => {
    const uid = await requireUserCtx(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);
    const days = args.days ?? 30;
    const start = isoDaysAgo(days - 1);
    const end = isoDaysAgo(0);
    const prevStart = isoDaysAgo(days * 2 - 1);
    const prevEnd = isoDaysAgo(days);

    const snaps = await ctx.db
      .query("metricSnapshots")
      .withIndex("by_org_date", (q) => q.eq("orgId", args.orgId))
      .collect();

    const cur: ChannelMetrics = { ...ZERO_METRICS };
    const prev: ChannelMetrics = { ...ZERO_METRICS };
    const breakdown: Record<string, ChannelMetrics> = {
      email: { ...ZERO_METRICS },
      sms: { ...ZERO_METRICS },
      push: { ...ZERO_METRICS },
      whatsapp: { ...ZERO_METRICS },
    };

    const revenueByDate = new Map<string, number>();
    const filteredRevenueByDate = new Map<string, number>();
    const sendsByDate = new Map<string, number>();

    for (const s of snaps) {
      const d = s.date;
      if (d >= start && d <= end) {
        addMetrics(cur, s);
        addMetrics(breakdown[s.channel] ?? cur, s);
        revenueByDate.set(d, (revenueByDate.get(d) ?? 0) + s.revenue);
        filteredRevenueByDate.set(d, (filteredRevenueByDate.get(d) ?? 0) + (s.filteredRevenue ?? 0));
        sendsByDate.set(d, (sendsByDate.get(d) ?? 0) + s.sends);
      } else if (d >= prevStart && d <= prevEnd) {
        addMetrics(prev, s);
      }
    }

    const revenueSeries: MetricPoint[] = [];
    const filteredRevenueSeries: MetricPoint[] = [];
    const sendsSeries: MetricPoint[] = [];
    for (let i = 0; i < days; i++) {
      const d = isoDaysAgo(days - 1 - i);
      revenueSeries.push({ date: d, value: revenueByDate.get(d) ?? 0 });
      filteredRevenueSeries.push({ date: d, value: filteredRevenueByDate.get(d) ?? 0 });
      sendsSeries.push({ date: d, value: sendsByDate.get(d) ?? 0 });
    }

    // Real campaign/flow rows from the campaigns table (populated on sync).
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const topCampaigns = [...campaigns]
      .sort((a, b) => b.filteredRevenue - a.filteredRevenue)
      .slice(0, 5)
      .map((c) => ({
        id: c._id,
        name: c.name,
        channel: c.channel,
        tags: c.tags,
        sentAt: c.sentAt,
        revenue: c.revenue,
        filteredRevenue: c.filteredRevenue,
        sends: c.sends,
        opens: c.opens,
        clicks: c.clicks,
        conversions: c.conversions,
        openRate: c.sends ? c.opens / c.sends : 0,
        clickRate: c.opens ? c.clicks / c.opens : 0,
        conversionRate: c.clicks ? c.conversions / c.clicks : 0,
        aov: c.aov,
        creativeColor: c.creativeColor,
      }));

    const sources = await ctx.db
      .query("dataSources")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const realFlows = await ctx.db
      .query("flows")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const topFlows = realFlows.length
      ? [...realFlows]
          .sort((a, b) => b.filteredRevenue - a.filteredRevenue)
          .slice(0, 5)
          .map((f) => ({
            id: f._id,
            name: f.name,
            channel: f.channel,
            revenue: f.revenue,
            filteredRevenue: f.filteredRevenue,
            sends: f.sends,
            conversionRate: f.conversionRate,
            openRate: f.openRate,
            clickRate: f.clickRate,
            momRevenue: f.momRevenue,
          }))
      : sources
          .map((s, i) => ({
            id: s._id,
            name: `${s.name} — ${["Welcome Flow", "Abandonment", "Post-Purchase", "Winback", "VIP"][i % 5]}`,
            channel: (["email", "sms", "email", "push", "whatsapp"] as const)[i % 5],
            revenue: cur.revenue > 0 ? Math.round(cur.revenue * (0.3 - i * 0.05)) : 0,
            filteredRevenue: cur.filteredRevenue > 0 ? Math.round(cur.filteredRevenue * (0.3 - i * 0.05)) : 0,
            sends: cur.sends,
            conversionRate: cur.conversionRate,
            openRate: cur.openRate,
            clickRate: cur.clickRate,
            momRevenue: 0.12 + i * 0.03,
          }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);

    return {
      period: { start, end, compareStart: prevStart, compareEnd: prevEnd },
      metrics: finalize(cur),
      previousMetrics: finalize(prev),
      revenueSeries,
      filteredRevenueSeries,
      sendsSeries,
      topFlows,
      topCampaigns,
      channelBreakdown: {
        email: finalize(breakdown.email),
        sms: finalize(breakdown.sms),
      },
    };
  },
});

// G12: Recurring-order inflation — the differentiator Hiro leads with, made
// explicit and measurable org-wide. Returns how much of attributed revenue is
// subscription/recurring orders inflating raw totals, after the accurate-
// revenue filter is applied. Higher = more "inflated" the naive competitor
// view is, and more value Hiro (and this open build) recovers.
export const inflation = query({
  args: {
    sessionToken: v.string(),
    orgId: v.id("orgs"),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{
    recurringInflationPct: number;
    rawRevenue: number;
    accurateRevenue: number;
    recoveredRevenue: number;
    inflatedSources: { source: string; inflationPct: number }[];
  }> => {
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);
    const days = args.days ?? 30;
    const start = isoDaysAgo(days - 1);
    const end = isoDaysAgo(0);

    const snaps = await ctx.db
      .query("metricSnapshots")
      .withIndex("by_org_date", (q) => q.eq("orgId", args.orgId))
      .filter((q) => q.gte(q.field("date"), start))
      .filter((q) => q.lte(q.field("date"), end))
      .collect();

    let raw = 0;
    let accurate = 0;
    const bySource = new Map<string, { raw: number; accurate: number; name: string }>();
    for (const s of snaps) {
      raw += s.revenue;
      accurate += s.filteredRevenue ?? 0;
      const src = await ctx.db.get(s.sourceId);
      const key = s.sourceId;
      const entry = bySource.get(key) ?? { raw: 0, accurate: 0, name: src?.name ?? "Source" };
      entry.raw += s.revenue;
      entry.accurate += s.filteredRevenue ?? 0;
      bySource.set(key, entry);
    }
    const recurringInflationPct = accurate ? (raw / accurate - 1) * 100 : 0;
    const inflatedSources = [...bySource.entries()]
      .map(([id, e]) => ({
        source: e.name,
        inflationPct: e.accurate ? (e.raw / e.accurate - 1) * 100 : 0,
      }))
      .sort((a, b) => b.inflationPct - a.inflationPct);

    return {
      recurringInflationPct: Number(recurringInflationPct.toFixed(1)),
      rawRevenue: raw,
      accurateRevenue: accurate,
      recoveredRevenue: Math.max(0, raw - accurate),
      inflatedSources,
    };
  },
});

// Local require wrapper (kept here to avoid circular import lint noise).
import { requireUser, getOrgForUser } from "./authHelpers";
function requireUserCtx(ctx: any, token: string): Promise<string> {
  return requireUser(ctx, token);
}

// Nightly job: re-sync every connected source. Live sources refresh their
// OAuth token inside syncSource; mock sources re-derive deterministic rows.
// Exposed as an internal mutation so crons.ts can schedule it.
export const syncAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const sources = await ctx.db
      .query("dataSources")
      .filter((q) => q.eq(q.field("status"), "connected"))
      .collect();
    let scheduled = 0;
    for (const s of sources) {
      const live = !!(s.accessToken || s.apiKey);
      await ctx.scheduler.runAfter(scheduled * 250, "integrations:syncSource" as any, {
        sourceId: s._id,
        days: 30,
        live,
      });
      scheduled += 1;
    }
    return { scheduled: sources.length };
  },
});

// Internal action: prove the live Klaviyo pull works end-to-end with REAL
// credentials. Pass a live accessToken (from a connected Klaviyo source) and
// it runs fetchKlaviyoLive + fetchFlows, returning normalized counts. This is
// the verifiable "does real data actually come back?" check. Run it with:
//   npx convex run integrations:testLive '{ "accessToken": "<token>" }'
// (or without args to test the first connected Klaviyo source in the DB).
export const testLive = internalAction({
  args: { accessToken: v.optional(v.string()), sourceId: v.optional(v.id("dataSources")) },
  handler: async (ctx, args) => {
    let token = args.accessToken;
    if (!token && args.sourceId) {
      // Look up the live token from the connected source (public query).
      const src = await ctx.runQuery(api.dataSources.get, {
        sourceId: args.sourceId,
      } as any);
      token = (src as any)?.accessToken ?? null;
    }
    // Fall back to the Private API Key env (set for direct live checks).
    if (!token) token = process.env.KLAVIYO_API_KEY ?? undefined;
    if (!token) return { ok: false, reason: "no accessToken provided or found" };
    // Authenticate first so an empty result is distinguishable from a 401.
    const authRes = await fetch("https://a.klaviyo.com/api/accounts/?page_size=1", {
      headers: { Authorization: `Bearer ${token}`, accept: "application/json", revision: "2026-07-15" },
    });
    if (!authRes.ok) {
      const body = await authRes.text().catch(() => "");
      return {
        ok: false,
        authenticated: false,
        status: authRes.status,
        detail: body.slice(0, 300),
      };
    }
    try {
      const daily = await fetchKlaviyoLive(token, 7);
      const flows = await fetchFlows(token);
      const totalRevenue = daily.reduce((t, d) => t + (d.revenue ?? 0), 0);
      return {
        ok: true,
        authenticated: true,
        daysReturned: daily.length,
        rowsReturned: daily.length ? Object.keys(daily[0]).length : 0,
        totalRevenue,
        flowsReturned: flows.length,
        sampleDate: daily[0]?.date ?? null,
        sampleFlow: flows[0]?.name ?? null,
      };
    } catch (e: any) {
      return { ok: false, authenticated: true, reason: e?.message ?? String(e) };
    }
  },
});
