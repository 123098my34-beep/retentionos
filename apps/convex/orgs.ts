import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireUser } from "./authHelpers";

export const myMembership = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx, args.sessionToken);
    const member = await ctx.db
      .query("members")
      .withIndex("by_user", (q) => q.eq("userId", uid as any))
      .first();
    if (!member) return null;
    const org = await ctx.db.get(member.orgId);
    if (!org) return null;
    return {
      orgId: org._id,
      name: org.name,
      plan: org.plan,
      role: member.role,
    };
  },
});
