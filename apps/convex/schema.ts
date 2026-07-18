import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// Hiro Analytics — retention marketing analytics hub.
// Multi-tenant: orgs own data sources, members, and cached analytics snapshots.

const dataSourceType = v.union(
  v.literal("klaviyo"),
  v.literal("attentive"),
  v.literal("postscript"),
  v.literal("omnisend"),
  v.literal("sendlane"),
  v.literal("yotpo"),
);

const dataSourceStatus = v.union(
  v.literal("connected"),
  v.literal("disconnected"),
  v.literal("error"),
  v.literal("syncing"),
);

const channelType = v.union(
  v.literal("email"),
  v.literal("sms"),
  v.literal("push"),
  v.literal("whatsapp"),
);

export default defineSchema({
  // ---- Auth (custom email + password / magic link session auth) ----
  users: defineTable({
    email: v.string(),
    name: v.optional(v.string()),
    // Argon2id hash (mock mode still hashes). Empty for magic-link-only users.
    passwordHash: v.optional(v.string()),
    emailVerified: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_email", ["email"]),

  // Magic-link tokens (single use, short TTL).
  magicLinks: defineTable({
    userId: v.id("users"),
    token: v.string(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  }).index("by_token", ["token"]),

  sessions: defineTable({
    userId: v.id("users"),
    token: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
    // Refresh token (rotated on use) for the web client.
    refreshToken: v.string(),
  }).index("by_token", ["token"]),

  // ---- Organizations (agency / brand workspaces) ----
  orgs: defineTable({
    name: v.string(),
    ownerId: v.id("users"),
    plan: v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
    createdAt: v.number(),
  }),

  members: defineTable({
    orgId: v.id("orgs"),
    userId: v.id("users"),
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("member")),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_user", ["userId"])
    .index("by_org_user", ["orgId", "userId"]),

  // ---- Connected marketing data sources ----
  dataSources: defineTable({
    orgId: v.id("orgs"),
    type: dataSourceType,
    name: v.string(),
    status: dataSourceStatus,
    // Mock mode: a label like "Acme Store". Live mode: reference id only.
    accountLabel: v.string(),
    // Live OAuth (Klaviyo): tokens kept server-side, refreshed as needed.
    accessToken: v.optional(v.string()),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    apiKey: v.optional(v.string()),
    externalAccountId: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_org_type", ["orgId", "type"]),

  // ---- OAuth PKCE state store (server-to-server token exchange) ----
  oauthStates: defineTable({
    state: v.string(),
    codeVerifier: v.string(),
    orgId: v.id("orgs"),
    userId: v.id("users"),
    createdAt: v.number(),
    expiresAt: v.number(),
  }).index("by_state", ["state"]),

  // ---- Public client share links (read-only dashboard) ----
  shares: defineTable({
    orgId: v.id("orgs"),
    token: v.string(),
    title: v.string(),
    periodDays: v.number(),
    createdAt: v.number(),
    expiresAt: v.optional(v.number()),
  }).index("by_token", ["token"]),

  // ---- Cached daily metric snapshots per source (populated by sync) ----
  metricSnapshots: defineTable({
    orgId: v.id("orgs"),
    sourceId: v.id("dataSources"),
    date: v.string(), // YYYY-MM-DD
    channel: channelType,
    revenue: v.number(), // attributed (raw)
    filteredRevenue: v.optional(v.number()), // recurring orders excluded
    spend: v.number(),
    sends: v.number(),
    opens: v.number(),
    clicks: v.number(),
    conversions: v.number(),
    newSubscribers: v.number(),
    unsubscribes: v.number(),
  })
    .index("by_org_date", ["orgId", "date"])
    .index("by_source", ["sourceId"]),

  // ---- Campaign-level performance (deep dive, filters, compare) ----
  campaigns: defineTable({
    orgId: v.id("orgs"),
    sourceId: v.id("dataSources"),
    name: v.string(),
    channel: channelType,
    tags: v.array(v.string()),
    sentAt: v.number(),
    revenue: v.number(),
    filteredRevenue: v.number(),
    sends: v.number(),
    opens: v.number(),
    clicks: v.number(),
    conversions: v.number(),
    aov: v.number(),
    creativeColor: v.string(),
  })
    .index("by_org", ["orgId"])
    .index("by_source", ["sourceId"])
    .index("by_org_sent", ["orgId", "sentAt"]),

  // ---- Cohort retention snapshots (computed per period) ----
  cohorts: defineTable({
    orgId: v.id("orgs"),
    label: v.string(),
    filters: v.array(v.string()),
    points: v.array(
      v.object({
        days: v.number(),
        cumulativeConversion: v.number(),
        emailAttributedValue: v.number(),
        totalValue: v.number(),
      }),
    ),
    emailLiftPerCustomer: v.number(),
    totalValuePerCustomer: v.number(),
    createdAt: v.number(),
  }).index("by_org", ["orgId"]),

  // ---- Subscriber -> first purchase funnel snapshots ----
  subscriberFunnels: defineTable({
    orgId: v.id("orgs"),
    sourceId: v.id("dataSources"),
    totalSubscribers: v.number(),
    netNewProspects: v.number(),
    convertedWithin30d: v.number(),
    emailAttributedConversions: v.number(),
    byDay: v.array(
      v.object({ day: v.number(), cumulative: v.number(), raw: v.number() }),
    ),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_source", ["sourceId"]),

  // ---- Real flow performance (populated from live platforms, e.g. Klaviyo
  // /flows). Drives the dashboard "Top Flows" with actual data instead of
  // mock-derived rows. When empty (mock mode / unsupported platform) the UI
  // falls back to a deterministic mock. ----
  flows: defineTable({
    orgId: v.id("orgs"),
    sourceId: v.id("dataSources"),
    name: v.string(),
    channel: channelType,
    revenue: v.number(),
    filteredRevenue: v.number(),
    sends: v.number(),
    conversions: v.number(),
    openRate: v.number(),
    clickRate: v.number(),
    conversionRate: v.number(),
    momRevenue: v.number(),
    createdAt: v.number(),
  })
    .index("by_org", ["orgId"])
    .index("by_source", ["sourceId"]),

  // ---- Account revenue targets (for pacing/alerts) ----
  targets: defineTable({
    orgId: v.id("orgs"),
    sourceId: v.id("dataSources"),
    monthlyTarget: v.number(),
    createdAt: v.number(),
  }).index("by_org", ["orgId"]),

  // ---- Alerts / proactive notifications ----
  alerts: defineTable({
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
    enabled: v.boolean(),
    createdAt: v.number(),
  }).index("by_org", ["orgId"]),

  // ---- Generated reports (automated reporting + AI summary) ----
  reports: defineTable({
    orgId: v.id("orgs"),
    title: v.string(),
    periodStart: v.string(),
    periodEnd: v.string(),
    status: v.union(v.literal("draft"), v.literal("generated")),
    summary: v.optional(v.string()),
    followUps: v.optional(v.array(v.string())),
    createdAt: v.number(),
  }).index("by_org", ["orgId"]),

  // ---- Industry benchmark medians (live feed, refreshed weekly) ----
  // Single global config doc (key = "global") holding the current medians
  // used by the adapter's buildBenchmarks. benchmarks.refresh updates it from
  // BENCHMARK_FEED_URL when set; otherwise it seeds illustrative defaults.
  benchmarkConfig: defineTable({
    key: v.string(),
    medians: v.array(
      v.object({
        metric: v.string(),
        industryMedian: v.number(),
        unit: v.union(v.literal("percent"), v.literal("currency"), v.literal("ratio")),
      }),
    ),
    source: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_key", ["key"]),
});
