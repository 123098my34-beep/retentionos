import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getAccountIdFromToken } from "./klaviyo";

export const storeState = internalMutation({
  args: {
    state: v.string(),
    codeVerifier: v.string(),
    orgId: v.id("orgs"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("oauthStates", {
      state: args.state,
      codeVerifier: args.codeVerifier,
      orgId: args.orgId,
      userId: args.userId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 1000 * 60 * 10, // 10 min
    });
    return { ok: true };
  },
});

export const getState = internalQuery({
  args: { state: v.string() },
  handler: async (ctx, args) => {
    const s = await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique();
    if (!s || s.expiresAt < Date.now()) return null;
    return { codeVerifier: s.codeVerifier, orgId: s.orgId, userId: s.userId };
  },
});

export const finalizeKlaviyo = internalMutation({
  args: {
    state: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresIn: v.number(),
    platform: v.optional(
      v.union(v.literal("klaviyo"), v.literal("attentive")),
    ),
  },
  handler: async (ctx, args) => {
    const s = await ctx.db
      .query("oauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .unique();
    if (!s) throw new Error("Unknown state");
    const platform = args.platform ?? "klaviyo";
    const label = platform === "attentive" ? "Attentive" : "Klaviyo";
    // Find or create the org's data source.
    const existing = await ctx.db
      .query("dataSources")
      .withIndex("by_org_type", (q) =>
        q.eq("orgId", s.orgId).eq("type", platform),
      )
      .first();
    const accountId = await getAccountIdFromToken(args.accessToken);
    const expiresAt = Date.now() + args.expiresIn * 1000;
    let sourceId: any;
    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "connected",
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        tokenExpiresAt: expiresAt,
        externalAccountId: accountId,
        accountLabel: accountId,
        lastSyncedAt: Date.now(),
      });
      sourceId = existing._id;
    } else {
      const id = await ctx.db.insert("dataSources", {
        orgId: s.orgId,
        type: platform,
        name: label,
        status: "connected",
        accountLabel: accountId,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        tokenExpiresAt: expiresAt,
        externalAccountId: accountId,
        lastSyncedAt: Date.now(),
        createdAt: Date.now(),
      });
      await ctx.db.insert("targets", {
        orgId: s.orgId,
        sourceId: id,
        monthlyTarget: 240000,
        createdAt: Date.now(),
      });
      sourceId = id;
    }
    // Clean up the one-time state.
    await ctx.db.delete(s._id);
    // Kick off a real sync in the background.
    await ctx.scheduler.runAfter(0, internal.integrations.syncSource as any, {
      sourceId,
      days: 30,
      live: true,
    });
    return { ok: true };
  },
});
