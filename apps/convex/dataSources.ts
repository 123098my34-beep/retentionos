import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, getOrgForUser } from "./authHelpers";
import { DATA_SOURCE_LABELS } from "@hiro/shared";
import { getAdapter } from "./integrations/adapter";

export const list = query({
  args: { sessionToken: v.string(), orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);
    const sources = await ctx.db
      .query("dataSources")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    return sources.map((s) => ({
      id: s._id,
      type: s.type,
      name: s.name,
      status: s.status,
      accountLabel: s.accountLabel,
      lastSyncedAt: s.lastSyncedAt ?? null,
      createdAt: s.createdAt,
    }));
  },
});

export const connect = mutation({
  args: {
    sessionToken: v.string(),
    orgId: v.id("orgs"),
    type: v.union(
      v.literal("klaviyo"),
      v.literal("attentive"),
      v.literal("postscript"),
      v.literal("omnisend"),
      v.literal("sendlane"),
      v.literal("yotpo"),
    ),
    accountLabel: v.string(),
    apiKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);
    const name = DATA_SOURCE_LABELS[args.type];
    const id = await ctx.db.insert("dataSources", {
      orgId: args.orgId,
      type: args.type,
      name,
      status: "connected",
      accountLabel: args.accountLabel,
      apiKey: args.apiKey,
      lastSyncedAt: Date.now(),
      createdAt: Date.now(),
    });
    // Immediately backfill mock metrics so the dashboard has data.
    await ctx.scheduler.runAfter(0, "integrations:syncSource" as any, {
      sourceId: id,
      days: 30,
    });
    // Seed a monthly revenue target for pacing/alerts (mock: ~115% of avg).
    await ctx.db.insert("targets", {
      orgId: args.orgId,
      sourceId: id,
      monthlyTarget: 240000,
      createdAt: Date.now(),
    });
    return { id };
  },
});

// Fetch a single source by id (internal helper for live checks).
export const get = query({
  args: { sourceId: v.id("dataSources") },
  handler: async (ctx, args) => {
    const s = await ctx.db.get(args.sourceId);
    if (!s) return null;
    return {
      id: s._id,
      type: s.type,
      name: s.name,
      status: s.status,
      accessToken: s.accessToken,
      apiKey: s.apiKey,
    };
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string(), sourceId: v.id("dataSources") },
  handler: async (ctx, args) => {
    const src = await ctx.db.get(args.sourceId);
    if (!src) return { ok: true };
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, src.orgId);
    await ctx.db.patch(args.sourceId, { status: "disconnected" });
    return { ok: true };
  },
});

// Manually (re)sync a connected source now. Used for the "live-data proof"
// (connect real Klaviyo/Attentive creds, hit sync, confirm real rows land in
// metricSnapshots) and as an on-demand refresh in the UI. Honors live vs mock
// automatically based on whether accessToken/apiKey is present.
export const syncNow = mutation({
  args: {
    sessionToken: v.string(),
    sourceId: v.id("dataSources"),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const src = await ctx.db.get(args.sourceId);
    if (!src) return { ok: false };
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, src.orgId);
    const live = !!(src.accessToken || src.apiKey);
    await ctx.scheduler.runAfter(0, "integrations:syncSource" as any, {
      sourceId: args.sourceId,
      days: args.days ?? 30,
      live,
    });
    await ctx.db.patch(args.sourceId, { status: "syncing" });
    return { ok: true, live };
  },
});
