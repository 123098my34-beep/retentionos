// Shared domain types for Hiro Analytics.

export type DataSourceType =
  | "klaviyo"
  | "attentive"
  | "postscript"
  | "omnisend"
  | "sendlane"
  | "yotpo";

export type DataSourceStatus =
  | "connected"
  | "disconnected"
  | "error"
  | "syncing";

export interface DataSource {
  id: string;
  orgId: string;
  type: DataSourceType;
  name: string;
  status: DataSourceStatus;
  // Mock-mode: no real credentials stored. In live mode this holds an
  // encrypted token reference, never the raw secret.
  accountLabel: string;
  lastSyncedAt: number | null;
  createdAt: number;
}

export interface MetricPoint {
  date: string; // ISO date (YYYY-MM-DD)
  value: number;
}

export type Channel = "email" | "sms" | "push" | "whatsapp";

export interface ChannelMetrics {
  // Revenue & spend
  revenue: number; // attributed revenue (raw, includes recurring)
  filteredRevenue: number; // recurring/subscription orders excluded (accurate)
  spend: number;
  // Volume
  sends: number;
  opens: number;
  clicks: number;
  conversions: number;
  // List health
  newSubscribers: number;
  unsubscribes: number;
  // Derived
  openRate: number;
  clickRate: number;
  ctr: number;
  conversionRate: number;
  roi: number;
  // Recurring-order inflation ratio (revenue / filteredRevenue - 1)
  recurringInflation: number;
}

export const ZERO_METRICS: ChannelMetrics = {
  revenue: 0,
  filteredRevenue: 0,
  spend: 0,
  sends: 0,
  opens: 0,
  clicks: 0,
  conversions: 0,
  newSubscribers: 0,
  unsubscribes: 0,
  openRate: 0,
  clickRate: 0,
  ctr: 0,
  conversionRate: 0,
  roi: 0,
  recurringInflation: 0,
};

export interface FlowPerformance {
  id: string;
  name: string;
  channel: Channel;
  revenue: number;
  filteredRevenue: number;
  sends: number;
  conversionRate: number;
  openRate: number;
  clickRate: number;
  // Period-over-period revenue delta, as a ratio (0.12 = +12%)
  momRevenue: number;
}

export interface CampaignPerformance {
  id: string;
  name: string;
  channel: Channel;
  tags: string[];
  sentAt: number;
  revenue: number;
  filteredRevenue: number;
  sends: number;
  opens: number;
  clicks: number;
  conversions: number;
  openRate: number;
  clickRate: number;
  conversionRate: number;
  aov: number;
  // Optional creative thumbnail (mock: gradient seed), so we can show
  // creatives WITH their performance like Hiro's creative view.
  creativeColor: string;
}

export interface CohortPoint {
  days: number; // 0, 7, 14, 30, 60, 90
  cumulativeConversion: number; // fraction of cohort converted by this day
  emailAttributedValue: number; // $ per customer attributed to email
  totalValue: number; // $ per customer total
}

export interface CohortAnalysis {
  cohortLabel: string;
  filters: string[];
  points: CohortPoint[];
  // Incremental lift: email-attributed value per customer.
  emailLiftPerCustomer: number;
  totalValuePerCustomer: number;
}

export interface SubscriberFunnel {
  totalSubscribers: number;
  netNewProspects: number;
  convertedWithin30d: number;
  emailAttributedConversions: number;
  conversionRate: number; // converted / netNewProspects
  // Day-by-day cumulative conversion curve of net-new prospects.
  byDay: { day: number; cumulative: number; raw: number }[];
}

export interface Benchmark {
  metric: string;
  yourValue: number;
  industryMedian: number;
  // Percentile of "your" value vs industry (0-100).
  percentile: number;
  unit: "percent" | "currency" | "ratio";
}

export interface AccountPace {
  id: string; // source id (= account)
  name: string;
  channel: Channel;
  revenue: number;
  prevRevenue: number;
  target: number;
  pacePct: number; // revenue / target
  momPct: number; // revenue / prevRevenue - 1
}

export interface AlertRule {
  id: string;
  orgId: string;
  name: string;
  metric: "revenue" | "sends" | "conversionRate" | "openRate";
  channel: Channel | "all";
  direction: "drop" | "below_target";
  thresholdPct: number; // e.g. 0.2 = alert if drops 20%
  cadence: "daily" | "weekly";
  enabled: boolean;
  createdAt: number;
}

export interface ReportSummary {
  id: string;
  orgId?: string;
  title: string;
  periodStart: string;
  periodEnd: string;
  status: "draft" | "generated";
  summary?: string; // AI-style narrative summary
  followUps: string[]; // suggested follow-up items
  createdAt: number;
}

export interface DashboardSummary {
  period: { start: string; end: string; compareStart: string; compareEnd: string };
  metrics: ChannelMetrics;
  previousMetrics: ChannelMetrics;
  revenueSeries: MetricPoint[];
  filteredRevenueSeries: MetricPoint[];
  sendsSeries: MetricPoint[];
  topFlows: FlowPerformance[];
  topCampaigns: CampaignPerformance[];
  channelBreakdown: { email: ChannelMetrics; sms: ChannelMetrics };
}

export const DATA_SOURCE_LABELS: Record<DataSourceType, string> = {
  klaviyo: "Klaviyo",
  attentive: "Attentive",
  postscript: "Postscript",
  omnisend: "Omnisend",
  sendlane: "Sendlane",
  yotpo: "Yotpo",
};

// Normalized daily metrics returned by any live connector (or mock).
export interface LiveDaily {
  date: string; // YYYY-MM-DD
  channel: Channel;
  sends: number;
  opens: number;
  clicks: number;
  conversions: number;
  revenue: number;
  spend: number;
  newSubscribers: number;
  unsubscribes: number;
}
