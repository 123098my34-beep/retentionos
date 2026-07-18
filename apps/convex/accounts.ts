import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, getOrgForUser } from "./authHelpers";

// G2: Multi-account rollup — agencies see every client account pacing vs
// target and vs previous period, and can triage underperformers.
export const pacing = query({
  args: {
    sessionToken: v.string(),
    orgId: v.id("orgs"),
  },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);

    const sources = await ctx.db
      .query("dataSources")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .filter((q) => q.eq(q.field("status"), "connected"))
      .collect();
    const targets = await ctx.db
      .query("targets")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    const targetMap = new Map(targets.map((t) => [t.sourceId, t.monthlyTarget]));

    const snapBySource = new Map<string, { cur: number; prev: number }>();
    const snaps = await ctx.db
      .query("metricSnapshots")
      .withIndex("by_org_date", (q) => q.eq("orgId", args.orgId))
      .collect();
    const now = Date.now();
    const startCur = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
    const startPrev = new Date(now - 60 * 86400000).toISOString().slice(0, 10);
    const endPrev = new Date(now - 30 * 86400000).toISOString().slice(0, 10);
    for (const s of snaps) {
      const entry = snapBySource.get(s.sourceId) ?? { cur: 0, prev: 0 };
      if (s.date >= startCur) entry.cur += s.filteredRevenue ?? s.revenue;
      else if (s.date >= startPrev && s.date <= endPrev)
        entry.prev += s.filteredRevenue ?? s.revenue;
      snapBySource.set(s.sourceId, entry);
    }

    const accounts = sources.map((s) => {
      const rev = snapBySource.get(s._id) ?? { cur: 0, prev: 0 };
      const target = targetMap.get(s._id) ?? Math.round(rev.cur * 1.15);
      return {
        id: s._id,
        name: s.name,
        accountLabel: s.accountLabel,
        type: s.type,
        revenue: rev.cur,
        prevRevenue: rev.prev,
        target,
        pacePct: target ? rev.cur / target : 0,
        momPct: rev.prev ? rev.cur / rev.prev - 1 : 0,
      };
    });

    const orgTotal = accounts.reduce((s, a) => s + a.revenue, 0);
    const orgTarget = accounts.reduce((s, a) => s + a.target, 0);
    return {
      accounts,
      orgTotal,
      orgTarget,
      orgPacePct: orgTarget ? orgTotal / orgTarget : 0,
      underperforming: accounts
        .filter((a) => a.pacePct < 0.9)
        .map((a) => a.name),
    };
  },
});
