// Scheduled jobs (Convex crons). These replace the manual "sync on connect"
// only flow from the README's TODO list, giving us nightly, hands-off syncs
// and proactive alert evaluation — the "monitor performance / client pacing"
// surface Hiro sells as a premium feature.
//
// `crons.ts` is picked up automatically by `convex dev` / `convex deploy`.

import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Nightly sync of every connected source (live token refresh handled inside
// syncSource). Runs at 03:10 UTC so it lands in US-east quiet hours.
crons.cron("nightly source sync", "10 3 * * *", internal.integrations.syncAll, {});

// Daily alert evaluation (pacing + performance drops). Runs at 07:00 UTC so
// agencies see issues before the workday.
crons.cron("daily alert check", "0 7 * * *", internal.alerts.checkAll, {});

// Weekly benchmark refresh placeholder (quarterly medians are static today;
// this hook lets us swap in fresh industry data without code changes).
crons.weekly(
  "weekly benchmark refresh",
  { dayOfWeek: "monday", hourUTC: 4, minuteUTC: 30 },
  internal.benchmarks.refresh,
  {},
);

export default crons;
