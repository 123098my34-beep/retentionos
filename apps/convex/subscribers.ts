import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, getOrgForUser } from "./authHelpers";

// G7: Subscriber -> first purchase conversion funnel.
export const funnel = query({
  args: {
    sessionToken: v.string(),
    orgId: v.id("orgs"),
    sourceId: v.optional(v.id("dataSources")),
  },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);

    const f = args.sourceId
      ? await ctx.db
          .query("subscriberFunnels")
          .withIndex("by_source", (q) => q.eq("sourceId", args.sourceId as any))
          .first()
      : await ctx.db
          .query("subscriberFunnels")
          .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
          .first();
    if (!f) return null;
    return {
      totalSubscribers: f.totalSubscribers,
      netNewProspects: f.netNewProspects,
      convertedWithin30d: f.convertedWithin30d,
      emailAttributedConversions: f.emailAttributedConversions,
      conversionRate: f.netNewProspects
        ? f.convertedWithin30d / f.netNewProspects
        : 0,
      byDay: f.byDay,
    };
  },
});
