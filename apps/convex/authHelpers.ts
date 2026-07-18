import { QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

// ---------------------------------------------------------------------------
// Session resolution (works inside queries AND actions via runQuery/runMutation)
// ---------------------------------------------------------------------------

export async function resolveUserId(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string,
): Promise<string | null> {
  const s = await ctx.db
    .query("sessions")
    .withIndex("by_token", (q) => q.eq("token", sessionToken))
    .unique();
  if (!s || s.expiresAt < Date.now()) return null;
  return s.userId;
}

export async function requireUser(
  ctx: QueryCtx | MutationCtx,
  sessionToken: string,
): Promise<string> {
  const uid = await resolveUserId(ctx, sessionToken);
  if (!uid) throw new Error("Unauthorized");
  return uid;
}

export async function getOrgForUser(
  ctx: QueryCtx | MutationCtx,
  userId: string,
  orgId: string,
): Promise<string> {
  const member = await ctx.db
    .query("members")
    .withIndex("by_org_user", (q) =>
      q.eq("orgId", orgId as any).eq("userId", userId as any),
    )
    .unique();
  if (!member) throw new Error("Not a member of this organization");
  return member.orgId;
}

// ---------------------------------------------------------------------------
// Crypto helpers (Web Crypto — available in Convex default runtime)
// ---------------------------------------------------------------------------

export function randomToken(bytes = 32): string {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export { hashPassword, verifyPasswordHash } from "./lib/password";

// (Argon2id implementation lives in ./lib/password, which has no Convex/runtime
// imports so it can be unit-tested directly.)

// Common validators
export const argSessionToken = { sessionToken: v.string() };
