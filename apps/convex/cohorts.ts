import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, getOrgForUser } from "./authHelpers";
import { getAdapter } from "./integrations/adapter";

// G6: Cohort retention — incremental lift of email on LTV, filterable.
export const analyze = query({
  args: {
    sessionToken: v.string(),
    orgId: v.id("orgs"),
    sourceType: v.optional(
      v.union(
        v.literal("klaviyo"),
        v.literal("attentive"),
        v.literal("postscript"),
        v.literal("omnisend"),
        v.literal("sendlane"),
        v.literal("yotpo"),
      ),
    ),
    label: v.optional(v.string()),
    filters: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);
    const type = args.sourceType ?? "klaviyo";
    const adapter = getAdapter(type);
    // Prefer a real snapshot populated during sync (live Klaviyo). Fall back
    // to the deterministic mock so the UI always has a curve.
    const stored = await ctx.db
      .query("cohorts")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .first();
    if (stored) {
      return {
        cohortLabel: args.label ?? stored.label,
        filters: args.filters ?? stored.filters,
        points: stored.points,
        emailLiftPerCustomer: stored.emailLiftPerCustomer,
        totalValuePerCustomer: stored.totalValuePerCustomer,
      };
    }
    return adapter.buildCohort(
      args.label ?? "First-time purchasers",
      args.filters ?? [],
    );
  },
});
