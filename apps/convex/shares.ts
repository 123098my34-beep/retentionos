import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, getOrgForUser } from "./authHelpers";
import { randomToken } from "./authHelpers";

// Create a public, read-only share link for the org's dashboard.
export const create = mutation({
  args: {
    sessionToken: v.string(),
    orgId: v.id("orgs"),
    title: v.string(),
    periodDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);
    const token = randomToken(16);
    const id = await ctx.db.insert("shares", {
      orgId: args.orgId,
      token,
      title: args.title,
      periodDays: args.periodDays ?? 30,
      createdAt: Date.now(),
    });
    return { id, token };
  },
});

export const list = query({
  args: { sessionToken: v.string(), orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);
    const shares = await ctx.db
      .query("shares")
      .withIndex("by_token")
      .collect();
    return shares
      .filter((s) => s.orgId === args.orgId)
      .map((s) => ({
        id: s._id,
        title: s.title,
        token: s.token,
        periodDays: s.periodDays,
        createdAt: s.createdAt,
      }));
  },
});

// PUBLIC: anyone with the token can read the aggregated summary (no auth).
export const getShared = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const share = await ctx.db
      .query("shares")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!share) return null;
    // Aggregate snapshots for the share period (lightweight public summary).
    const days = share.periodDays;
    const start = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const end = new Date().toISOString().slice(0, 10);
    const snaps = await ctx.db
      .query("metricSnapshots")
      .withIndex("by_org_date", (q) => q.eq("orgId", share.orgId))
      .filter((q) => q.gte(q.field("date"), start))
      .filter((q) => q.lte(q.field("date"), end))
      .collect();
    let revenue = 0,
      filteredRevenue = 0,
      sends = 0,
      opens = 0,
      clicks = 0,
      conversions = 0,
      newSubs = 0,
      unsubs = 0;
    for (const s of snaps) {
      revenue += s.revenue;
      filteredRevenue += s.filteredRevenue ?? 0;
      sends += s.sends;
      opens += s.opens;
      clicks += s.clicks;
      conversions += s.conversions;
      newSubs += s.newSubscribers;
      unsubs += s.unsubscribes;
    }
    return {
      title: share.title,
      periodDays: days,
      metrics: {
        revenue,
        filteredRevenue,
        sends,
        opens,
        clicks,
        conversions,
        newSubscribers: newSubs,
        unsubscribes: unsubs,
        openRate: sends ? opens / sends : 0,
        clickRate: opens ? clicks / opens : 0,
        conversionRate: clicks ? conversions / clicks : 0,
        roi: 0,
      },
    };
  },
});
