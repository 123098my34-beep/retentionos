import { query, mutation, internalMutation, internalAction } from "./_generated/server";
import { v } from "convex/values";
import { requireUser, getOrgForUser } from "./authHelpers";

// ---------------------------------------------------------------------------
// Notification delivery for fired alerts.
//
// Delivery is pluggable via environment variables (none required — when unset
// the alert is logged server-side only, so the scaffold still "works" with no
// external setup, the way Hiro's monitoring does but open):
//   - ALERT_WEBHOOK  : Slack (or any JSON POST) incoming webhook URL.
//   - ALERT_EMAIL_URL: an email/SMS gateway that accepts a JSON {to,subject,body}
//     POST (e.g. Postmark/Resend/Twilio SendGrid compatible endpoint).
//   - ALERT_EMAIL_TO : default recipient for the email/SMS gateway.
// ---------------------------------------------------------------------------

async function deliverFired(orgId: string, fired: any[]): Promise<{
  slack: boolean;
  email: boolean;
  logged: number;
}> {
  if (fired.length === 0) return { slack: false, email: false, logged: 0 };

  const lines = fired
    .map(
      (f) =>
        `• [${f.name}] ${f.metric}${f.channel !== "all" ? ` (${f.channel})` : ""}: ${f.message}`,
    )
    .join("\n");
  const text = `:rotating_light: Hiro alert${fired.length > 1 ? "s" : ""} fired for <${orgId}>\n${lines}`;

  let slack = false;
  const webhook = process.env.ALERT_WEBHOOK;
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      slack = res.ok;
    } catch (e) {
      console.error("alert slack delivery failed", e);
    }
  }

  let email = false;
  const emailUrl = process.env.ALERT_EMAIL_URL;
  const emailTo = process.env.ALERT_EMAIL_TO;
  if (emailUrl && emailTo) {
    try {
      const res = await fetch(emailUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: emailTo,
          subject: `Hiro Analytics — ${fired.length} alert(s) fired`,
          body: text,
        }),
      });
      email = res.ok;
    } catch (e) {
      console.error("alert email delivery failed", e);
    }
  }

  // Always log so fired alerts are observable in convex logs regardless of
  // whether an external delivery channel is configured.
  console.log(`[alerts] org ${orgId}: ${fired.length} fired\n${text}`);
  return { slack, email, logged: fired.length };
}

// G9: Proactive alerts — pacing-to-target + performance-drop notifications.
export const list = query({
  args: { sessionToken: v.string(), orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);
    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .collect();
    return alerts.map((a) => ({
      id: a._id,
      name: a.name,
      metric: a.metric,
      channel: a.channel,
      direction: a.direction,
      thresholdPct: a.thresholdPct,
      cadence: a.cadence,
      enabled: a.enabled,
    }));
  },
});

export const create = mutation({
  args: {
    sessionToken: v.string(),
    orgId: v.id("orgs"),
    name: v.string(),
    metric: v.union(
      v.literal("revenue"),
      v.literal("sends"),
      v.literal("conversionRate"),
      v.literal("openRate"),
    ),
    channel: v.union(
      v.literal("email"),
      v.literal("sms"),
      v.literal("push"),
      v.literal("whatsapp"),
      v.literal("all"),
    ),
    direction: v.union(v.literal("drop"), v.literal("below_target")),
    thresholdPct: v.number(),
    cadence: v.union(v.literal("daily"), v.literal("weekly")),
  },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);
    return ctx.db.insert("alerts", {
      orgId: args.orgId,
      name: args.name,
      metric: args.metric,
      channel: args.channel,
      direction: args.direction,
      thresholdPct: args.thresholdPct,
      cadence: args.cadence,
      enabled: true,
      createdAt: Date.now(),
    });
  },
});

export const toggle = mutation({
  args: { sessionToken: v.string(), alertId: v.id("alerts"), enabled: v.boolean() },
  handler: async (ctx, args) => {
    const a = await ctx.db.get(args.alertId);
    if (!a) return { ok: true };
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, a.orgId);
    await ctx.db.patch(args.alertId, { enabled: args.enabled });
    return { ok: true };
  },
});

// Field used to read each alert metric out of a metricSnapshot row.
const metricField: Record<string, string> = {
  revenue: "filteredRevenue",
  sends: "sends",
  conversionRate: "conversions",
  openRate: "opens",
};

const isoDaysAgo = (n: number) =>
  new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// Compare the last `window` days vs the prior `window` days for one alert's
// metric (channel-aware), and against the org's monthly target for the
// `below_target` direction. Returns a normalized evaluation result.
async function evaluateAlert(
  ctx: any,
  alert: any,
  orgId: string,
): Promise<{
  id: string;
  name: string;
  metric: string;
  channel: string;
  change: number;
  pacePct: number | null;
  fired: boolean;
  message: string;
}> {
  const field = metricField[alert.metric] ?? "filteredRevenue";
  const isAll = alert.channel === "all";
  const curStart = isoDaysAgo(alert.cadence === "weekly" ? 14 : 7);
  const curEnd = isoDaysAgo(0);
  const prevStart = isoDaysAgo(alert.cadence === "weekly" ? 21 : 14);
  const prevEnd = isoDaysAgo(alert.cadence === "weekly" ? 7 : 7);

  const snaps = await ctx.db
    .query("metricSnapshots")
    .withIndex("by_org_date", (q: any) => q.eq("orgId", orgId))
    .collect();

  const sum = (a: string, b: string) =>
    snaps
      .filter(
        (s: any) =>
          s.date >= a &&
          s.date <= b &&
          (isAll || s.channel === alert.channel),
      )
      .reduce((t: number, s: any) => t + (s[field] ?? 0), 0);

  const cur = sum(curStart, curEnd);
  const prev = sum(prevStart, prevEnd);
  const change = prev ? cur / prev - 1 : 0;

  if (alert.direction === "drop") {
    const fired = change <= -alert.thresholdPct;
    return {
      id: alert._id,
      name: alert.name,
      metric: alert.metric,
      channel: alert.channel,
      change,
      pacePct: null,
      fired,
      message: fired
        ? `${alert.metric} dropped ${(change * 100).toFixed(1)}% vs prior ${alert.cadence}`
        : `OK — ${alert.metric} ${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}% vs prior ${alert.cadence}`,
    };
  }

  // below_target: compare month-to-date metric vs the monthly target.
  const mtdStart = isoDaysAgo(30);
  const mtd = snaps
    .filter((s: any) => s.date >= mtdStart && (isAll || s.channel === alert.channel))
    .reduce((t: number, s: any) => t + (s[field] ?? 0), 0);
  const targets = await ctx.db
    .query("targets")
    .withIndex("by_org", (q: any) => q.eq("orgId", orgId))
    .collect();
  const target = targets.reduce((t: number, x: any) => t + (x.monthlyTarget ?? 0), 0);
  const pacePct = target ? mtd / target : 0;
  const fired = target > 0 && pacePct < 1 - alert.thresholdPct;
  return {
    id: alert._id,
    name: alert.name,
    metric: alert.metric,
    channel: alert.channel,
    change,
    pacePct,
    fired,
    message: fired
      ? `Pacing ${(pacePct * 100).toFixed(0)}% of target (${Math.abs((1 - pacePct) * 100).toFixed(0)}% short)`
      : `On pace — ${(pacePct * 100).toFixed(0)}% of monthly target`,
  };
}

// Evaluate the org's enabled alerts (used by the Alerts page + nightly cron).
export const evaluate = query({
  args: { sessionToken: v.string(), orgId: v.id("orgs") },
  handler: async (ctx, args) => {
    const uid = await requireUser(ctx, args.sessionToken);
    await getOrgForUser(ctx, uid, args.orgId);
    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_org", (q) => q.eq("orgId", args.orgId))
      .filter((q) => q.eq(q.field("enabled"), true))
      .collect();
    const out = [];
    for (const a of alerts) out.push(await evaluateAlert(ctx, a, args.orgId));
    return out;
  },
});

// Internal: evaluate every org's enabled alerts, then dispatch delivery of
// any fired alerts. Scheduled nightly by crons.ts. Because delivery needs
// fetch (Slack/email gateway), the notification itself runs as a separate
// internalAction scheduled off the mutation.
export const checkAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const orgs = await ctx.db.query("orgs").collect();
    let firedCount = 0;
    for (const org of orgs) {
      const alerts = await ctx.db
        .query("alerts")
        .withIndex("by_org", (q) => q.eq("orgId", org._id))
        .filter((q) => q.eq(q.field("enabled"), true))
        .collect();
      const fired: any[] = [];
      for (const a of alerts) {
        const result = await evaluateAlert(ctx, a, org._id as string);
        if (result.fired) fired.push(result);
      }
      if (fired.length > 0) {
        firedCount += fired.length;
        await ctx.scheduler.runAfter(
          0,
          "alerts:notify" as any,
          { orgId: org._id as string, fired },
        );
      }
    }
    return { firedCount };
  },
});

// Internal action: deliver a batch of fired alerts to the configured channel.
export const notify = internalAction({
  args: { orgId: v.id("orgs"), fired: v.array(v.any()) },
  handler: async (_ctx, args) => {
    return deliverFired(args.orgId as string, args.fired);
  },
});
