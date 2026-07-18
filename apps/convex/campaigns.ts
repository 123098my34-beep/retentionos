import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, getOrgForUser } from "./authHelpers";

// G4: Campaign deep dive — filter by tags / keyword, isolate a set, compare
// against another set across timeframes. Surpasses Hiro's filter UI.
export const deepDive = query({
  args: {
    sessionToken: v.string(),
    orgId: v.id("orgs"),
    includeTags: v.optional(v.array(v.string())),
    excludeTags: v.optional(v.array(v.string())),
    keyword: v.optional(v.string()),
    channel: v.optional(
      v.union(
        v.literal("email"),
        v.literal("sms"),
        v.literal("push"),
        v.literal("whatsapp"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);
    let camps = await ctx.db
      .query("campaigns")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();

    const kw = args.keyword?.toLowerCase();
    camps = camps.filter((c) => {
      if (args.channel && c.channel !== args.channel) return false;
      if (args.includeTags?.length) {
        if (!args.includeTags.some((t) => c.tags.includes(t))) return false;
      }
      if (args.excludeTags?.length) {
        if (args.excludeTags.some((t) => c.tags.includes(t))) return false;
      }
      if (kw && !c.name.toLowerCase().includes(kw)) return false;
      return true;
    });

    camps.sort((a, b) => b.filteredRevenue - a.filteredRevenue);
    if (args.limit) camps = camps.slice(0, args.limit);

    const aggregated = camps.reduce(
      (acc, c) => {
        acc.revenue += c.revenue;
        acc.filteredRevenue += c.filteredRevenue;
        acc.sends += c.sends;
        acc.opens += c.opens;
        acc.clicks += c.clicks;
        acc.conversions += c.conversions;
        acc.count += 1;
        return acc;
      },
      { revenue: 0, filteredRevenue: 0, sends: 0, opens: 0, clicks: 0, conversions: 0, count: 0 },
    );

    const aov = aggregated.conversions
      ? aggregated.revenue / aggregated.conversions
      : 0;
    const avgAov =
      camps.length > 0
        ? camps.reduce((s, c) => s + c.aov, 0) / camps.length
        : 0;

    return {
      campaigns: camps.map((c) => ({
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
      })),
      aggregated: {
        ...aggregated,
        openRate: aggregated.sends ? aggregated.opens / aggregated.sends : 0,
        clickRate: aggregated.opens ? aggregated.clicks / aggregated.opens : 0,
        conversionRate: aggregated.clicks
          ? aggregated.conversions / aggregated.clicks
          : 0,
        aov,
        avgAov,
      },
    };
  },
});
