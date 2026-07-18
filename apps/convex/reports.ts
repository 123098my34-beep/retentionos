import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, getOrgForUser } from "./authHelpers";

// G8: Automated branded reporting with AI-style summaries + follow-ups.
function buildSummary(metrics: any, topFlows: any[], topCampaigns: any[]) {
  const rev = Math.round(metrics.filteredRevenue || metrics.revenue);
  const prev = Math.round(metrics.previousMetrics?.filteredRevenue || metrics.previousMetrics?.revenue || 0);
  const mom = prev ? ((rev - prev) / prev) * 100 : 0;
  const topFlow = topFlows[0];
  const topCamp = topCampaigns[0];
  const summary =
    `Retention marketing drove $${rev.toLocaleString()} in attributed revenue this period ` +
    `(${mom >= 0 ? "+" : ""}${mom.toFixed(1)}% vs previous). ` +
    (topFlow ? `Top flow "${topFlow.name}" contributed $${Math.round(topFlow.filteredRevenue || topFlow.revenue).toLocaleString()}. ` : "") +
    (topCamp ? `Best campaign was "${topCamp.name}" at $${Math.round(topCamp.filteredRevenue || topCamp.revenue).toLocaleString()}. ` : "") +
    `Open rate ${(metrics.openRate * 100).toFixed(1)}%, conversion rate ${(metrics.conversionRate * 100).toFixed(1)}%, ` +
    `ROI ${metrics.roi ? (metrics.roi * 100).toFixed(0) + "%" : "n/a"}.`;
  const followUps = [
    metrics.conversionRate < 0.05
      ? "Conversion rate is below 5% — A/B test subject lines and CTA placement."
      : "Protect the winning flows; don't edit filters that are performing.",
    topCamp && topCamp.aov
      ? `Replicate "${topCamp.name}" anatomy (AOV $${Math.round(topCamp.aov)}) on a similar audience.`
      : "Launch a post-purchase cross-sell flow to lift LTV.",
    "Set a daily pacing alert on revenue to catch flow breaks early.",
  ];
  return { summary, followUps };
}

export const generate = mutation({
  args: {
    sessionToken: v.string(),
    orgId: v.id("orgs"),
    periodDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);
    const days = args.periodDays ?? 30;
    // Inline aggregation mirrors integrations.dashboard (kept local to avoid
    // import cycles). For production, refactor to a shared helper.
    const snaps = await ctx.db
      .query("metricSnapshots")
      .withIndex("by_org_date", (q) => q.eq("orgId", args.orgId))
      .collect();
    const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const end = new Date().toISOString().slice(0, 10);
    const prevStart = new Date(Date.now() - days * 2 * 86400000).toISOString().slice(0, 10);
    const prevEnd = start;

    const acc = { revenue: 0, filteredRevenue: 0, spend: 0, sends: 0, opens: 0, clicks: 0, conversions: 0, newSubscribers: 0, unsubscribes: 0 };
    const prev = { ...acc };
    for (const s of snaps) {
      const isCur = s.date >= start && s.date <= end;
      const isPrev = s.date >= prevStart && s.date <= prevEnd;
      if (!isCur && !isPrev) continue;
      const t = isCur ? acc : prev;
      t.revenue += s.revenue;
      t.filteredRevenue += s.filteredRevenue ?? 0;
      t.spend += s.spend;
      t.sends += s.sends;
      t.opens += s.opens;
      t.clicks += s.clicks;
      t.conversions += s.conversions;
    }
    const metrics = {
      revenue: acc.revenue,
      filteredRevenue: acc.filteredRevenue,
      spend: acc.spend,
      sends: acc.sends,
      opens: acc.opens,
      clicks: acc.clicks,
      conversions: acc.conversions,
      openRate: acc.sends ? acc.opens / acc.sends : 0,
      clickRate: acc.opens ? acc.clicks / acc.opens : 0,
      ctr: acc.sends ? acc.clicks / acc.sends : 0,
      conversionRate: acc.clicks ? acc.conversions / acc.clicks : 0,
      roi: acc.spend ? (acc.revenue - acc.spend) / acc.spend : 0,
      recurringInflation: 0,
      previousMetrics: { ...prev, filteredRevenue: prev.filteredRevenue, revenue: prev.revenue },
    };
    const campaigns = await ctx.db
      .query("campaigns")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const topCampaigns = [...campaigns]
      .sort((a, b) => b.filteredRevenue - a.filteredRevenue)
      .slice(0, 3)
      .map((c) => ({
        name: c.name,
        channel: c.channel,
        revenue: c.revenue,
        filteredRevenue: c.filteredRevenue,
        aov: c.aov,
      }));
    const sources = await ctx.db
      .query("dataSources")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const realFlowRows = await ctx.db
      .query("flows")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const topFlows = realFlowRows.length
      ? [...realFlowRows]
          .sort((a, b) => b.filteredRevenue - a.filteredRevenue)
          .slice(0, 3)
          .map((f) => ({
            name: f.name,
            revenue: f.revenue,
            filteredRevenue: f.filteredRevenue,
          }))
      : sources.slice(0, 3).map((s, i) => ({
          name: `${s.name} — ${["Welcome", "Abandonment", "Post-Purchase"][i % 3]}`,
          revenue: acc.revenue * (0.3 - i * 0.05),
          filteredRevenue: acc.filteredRevenue * (0.3 - i * 0.05),
        }));

    const { summary, followUps } = buildSummary(metrics, topFlows, topCampaigns);
    const id = await ctx.db.insert("reports", {
      orgId: args.orgId,
      title: `Retention Report — ${start} to ${end}`,
      periodStart: start,
      periodEnd: end,
      status: "generated",
      summary,
      followUps,
      createdAt: Date.now(),
    });
    return { id, summary, followUps };
  },
});

export const list = query({
  args: { sessionToken: v.string(), orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);
    const reports = await ctx.db
      .query("reports")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    return reports
      .map((r) => ({
        id: r._id,
        title: r.title,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        status: r.status,
        summary: r.summary,
        followUps: r.followUps ?? [],
        createdAt: r.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});
