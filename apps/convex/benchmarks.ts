import { query, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireUser, getOrgForUser } from "./authHelpers";
import { getAdapter } from "./integrations/adapter";

const CONFIG_KEY = "global";

// Illustrative default medians, used until a live feed is configured.
const DEFAULT_MEDIANS = [
  { metric: "Open rate", industryMedian: 0.365, unit: "percent" as const },
  { metric: "Click rate", industryMedian: 0.11, unit: "percent" as const },
  { metric: "Conversion rate", industryMedian: 0.055, unit: "percent" as const },
  { metric: "ROI", industryMedian: 6.5, unit: "ratio" as const },
  { metric: "Revenue / send", industryMedian: 0.42, unit: "currency" as const },
];

// Read the current medians (seeding defaults on first call).
async function readMedians(ctx: any) {
  const cfg = await ctx.db
    .query("benchmarkConfig")
    .withIndex("by_key", (q: any) => q.eq("key", CONFIG_KEY))
    .unique();
  if (cfg) return cfg.medians;
  const id = await ctx.db.insert("benchmarkConfig", {
    key: CONFIG_KEY,
    medians: DEFAULT_MEDIANS,
    source: "default",
    updatedAt: Date.now(),
  });
  const created = await ctx.db.get(id);
  return created?.medians ?? DEFAULT_MEDIANS;
}

// G11: Industry benchmark comparison for the org's aggregate metrics.
export const compare = query({
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
  },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);
    const snaps = await ctx.db
      .query("metricSnapshots")
      .withIndex("by_org_date", (q) => q.eq("orgId", args.orgId))
      .filter((q) => q.eq(q.field("channel"), "email"))
      .collect();
    let revenue = 0,
      filteredRevenue = 0,
      sends = 0,
      opens = 0,
      clicks = 0,
      conversions = 0,
      spend = 0;
    for (const s of snaps) {
      revenue += s.revenue;
      filteredRevenue += s.filteredRevenue ?? 0;
      sends += s.sends;
      opens += s.opens;
      clicks += s.clicks;
      conversions += s.conversions;
      spend += s.spend;
    }
    const m = {
      revenue,
      filteredRevenue,
      spend,
      sends,
      opens,
      clicks,
      conversions,
      newSubscribers: 0,
      unsubscribes: 0,
      openRate: sends ? opens / sends : 0,
      clickRate: opens ? clicks / opens : 0,
      ctr: sends ? clicks / sends : 0,
      conversionRate: clicks ? conversions / clicks : 0,
      roi: spend ? (revenue - spend) / spend : 0,
      recurringInflation: 0,
    };
    const medians = await readMedians(ctx);
    return getAdapter(args.sourceType ?? "klaviyo").buildBenchmarks(m, medians);
  },
});

// Internal mutation: persist medians into the config table.
export const persist = internalMutation({
  args: {
    medians: v.array(
      v.object({
        metric: v.string(),
        industryMedian: v.number(),
        unit: v.union(v.literal("percent"), v.literal("currency"), v.literal("ratio")),
      }),
    ),
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const cfg = await ctx.db
      .query("benchmarkConfig")
      .withIndex("by_key", (q: any) => q.eq("key", CONFIG_KEY))
      .unique();
    if (cfg) {
      await ctx.db.patch(cfg._id, {
        medians: args.medians,
        source: args.source,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("benchmarkConfig", {
        key: CONFIG_KEY,
        medians: args.medians,
        source: args.source,
        updatedAt: Date.now(),
      });
    }
    return { ok: true };
  },
});

// Internal action: refresh medians from a live feed when BENCHMARK_FEED_URL is
// set, then persist them. The feed must return JSON like:
//   [{ "metric": "Open rate", "industryMedian": 0.36, "unit": "percent" }, ...]
// When unset, it just re-seeds the illustrative defaults so the cron stays a
// no-op-safe seam. Scheduled weekly by crons.ts.
export const refresh = internalAction({
  args: {},
  handler: async (ctx) => {
    const feed = process.env.BENCHMARK_FEED_URL;
    if (!feed) {
      await ctx.runMutation(internal.benchmarks.persist, {
        medians: DEFAULT_MEDIANS,
        source: "default",
      });
      return { source: "default", count: DEFAULT_MEDIANS.length };
    }
    try {
      const res = await fetch(feed, { headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`feed ${res.status}`);
      const data = (await res.json()) as any[];
      const medians = data
        .filter((d) => d && typeof d.industryMedian === "number")
        .map((d) => ({
          metric: String(d.metric),
          industryMedian: Number(d.industryMedian),
          unit: (["percent", "currency", "ratio"].includes(d.unit)
            ? d.unit
            : "percent") as "percent" | "currency" | "ratio",
        }));
      if (medians.length === 0) throw new Error("empty feed");
      await ctx.runMutation(internal.benchmarks.persist, {
        medians,
        source: feed,
      });
      return { source: feed, count: medians.length };
    } catch (e: any) {
      console.error("benchmark refresh failed, keeping existing:", e?.message);
      return { source: "failed", error: e?.message };
    }
  },
});
