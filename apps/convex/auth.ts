import { query, mutation, internalMutation, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import {
  resolveUserId,
  requireUser,
  hashPassword,
  verifyPasswordHash,
  randomToken,
} from "./authHelpers";

const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const MAGIC_LINK_TTL_MS = 1000 * 60 * 15; // 15 minutes

// ---- Queries ---------------------------------------------------------------

export const me = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const uid = await resolveUserId(ctx, args.sessionToken);
    if (!uid) return null;
    const u = await ctx.db.get("users", uid as any);
    if (!u) return null;
    return {
      id: u._id,
      email: u.email,
      name: u.name,
      emailVerified: u.emailVerified,
    };
  },
});

// ---- Mutations: signup -----------------------------------------------------

export const signup = mutation({
  args: {
    email: v.string(),
    password: v.string(),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (existing) throw new Error("An account with this email already exists");

    const userId = await ctx.db.insert("users", {
      email,
      name: args.name,
      passwordHash: await hashPassword(args.password),
      emailVerified: false,
      createdAt: Date.now(),
    });

    const orgId = await ctx.db.insert("orgs", {
      name: `${args.name ?? email.split("@")[0]}'s Workspace`,
      ownerId: userId as any,
      plan: "free",
      createdAt: Date.now(),
    });
    await ctx.db.insert("members", {
      orgId: orgId as any,
      userId: userId as any,
      role: "owner",
      createdAt: Date.now(),
    });

    return issueSession(ctx, userId as string);
  },
});

export const login = mutation({
  args: { email: v.string(), password: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user || !user.passwordHash) throw new Error("Invalid credentials");
    const ok = await verifyPasswordHash(user.passwordHash, args.password);
    if (!ok) throw new Error("Invalid credentials");
    return issueSession(ctx, user._id as string);
  },
});

export const logout = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const s = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .unique();
    if (s) await ctx.db.delete(s._id);
    return { ok: true };
  },
});

// Rotate the session: validates the current token, then issues a fresh
// session + refresh token and retires the old session. Pair this with an
// httpOnly, Secure, SameSite cookie on the web client so tokens never touch
// localStorage (the scaffold's current approach). Returns the new tokens.
export const refreshSession = mutation({
  args: { sessionToken: v.string(), refreshToken: v.string() },
  handler: async (ctx, args) => {
    const s = await ctx.db
      .query("sessions")
      .withIndex("by_token", (q) => q.eq("token", args.sessionToken))
      .unique();
    if (!s || s.expiresAt < Date.now() || s.refreshToken !== args.refreshToken) {
      throw new Error("Invalid or expired session");
    }
    // Retire the old session to enforce single-use rotation.
    await ctx.db.delete(s._id);
    return issueSession(ctx, s.userId as string);
  },
});

// ---- Magic link ------------------------------------------------------------

// Request a magic link. Returns the token (in real life you'd email it).
export const requestMagicLink = mutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const email = args.email.toLowerCase().trim();
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", email))
      .unique();
    if (!user) throw new Error("No account found for this email");
    const token = randomToken(24);
    await ctx.db.insert("magicLinks", {
      userId: user._id,
      token,
      expiresAt: Date.now() + MAGIC_LINK_TTL_MS,
    });
    // Deliver the link via the configured email gateway (or log it in dev
    // when no gateway is set). Scheduled as an action because it uses fetch.
    await ctx.scheduler.runAfter(
      0,
      internal.auth.sendMagicEmail,
      { email, token },
    );
    // Still return the token so local dev (no email gateway) keeps working.
    return { token };
  },
});

export const verifyMagicLink = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const link = await ctx.db
      .query("magicLinks")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();
    if (!link || link.usedAt || link.expiresAt < Date.now())
      throw new Error("Invalid or expired magic link");
    await ctx.db.patch(link._id, { usedAt: Date.now() });
    await ctx.db.patch(link.userId, { emailVerified: true });
    return issueSession(ctx, link.userId as string);
  },
});

// Internal action: email the magic link. Uses a JSON email gateway if
// MAGIC_LINK_EMAIL_URL is set (any service accepting {to,subject,html}),
// otherwise logs the link so local dev still works. The link points at the
// web app's magic-login route.
export const sendMagicEmail = internalAction({
  args: { email: v.string(), token: v.string() },
  handler: async (_ctx, args) => {
    const base = process.env.HIRO_WEB_URL ?? "http://127.0.0.1:3000";
    const link = `${base}/?magic=${args.token}`;
    const gateway = process.env.MAGIC_LINK_EMAIL_URL;

    if (!gateway) {
      console.log(`[magic-link] (no email gateway) send to ${args.email}: ${link}`);
      return { delivered: false, link };
    }

    const subject = "Your Hiro Analytics sign-in link";
    const html = `<p>Click to sign in to Hiro Analytics:</p><p><a href="${link}">${link}</a></p><p>This link expires in 15 minutes.</p>`;
    const res = await fetch(gateway, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: args.email, subject, html, text: link }),
    });
    if (!res.ok) {
      console.error("magic-link email failed", res.status);
      return { delivered: false, link };
    }
    return { delivered: true, link };
  },
});

// ---- Internal helpers ------------------------------------------------------

async function issueSession(
  ctx: any,
  userId: string,
): Promise<{ sessionToken: string; refreshToken: string; userId: string }> {
  const sessionToken = randomToken(32);
  const refreshToken = randomToken(32);
  await ctx.db.insert("sessions", {
    userId: userId as any,
    token: sessionToken,
    refreshToken,
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
  });
  return { sessionToken, refreshToken, userId };
}
