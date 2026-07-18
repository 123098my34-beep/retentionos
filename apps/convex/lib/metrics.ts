// Pure metric helpers — no Convex ctx, no I/O. Centralized so both the
// backend call sites and the smoke tests share one implementation.

import type { ChannelMetrics } from "@hiro/shared";
import { ZERO_METRICS } from "@hiro/shared";

// Rough percentile: above median -> 50-99, below -> 1-49.
export function pctile(yours: number, median: number): number {
  if (median <= 0) return 50;
  const ratio = yours / median;
  if (ratio >= 1) return Math.min(99, Math.round(50 + (ratio - 1) * 40));
  return Math.max(1, Math.round(50 - (1 - ratio) * 40));
}

// Add one snapshot's metrics into an accumulator (mutates `acc`).
export function addMetrics(acc: ChannelMetrics, m: Partial<ChannelMetrics>): void {
  acc.revenue += m.revenue ?? 0;
  acc.filteredRevenue += m.filteredRevenue ?? 0;
  acc.spend += m.spend ?? 0;
  acc.sends += m.sends ?? 0;
  acc.opens += m.opens ?? 0;
  acc.clicks += m.clicks ?? 0;
  acc.conversions += m.conversions ?? 0;
  acc.newSubscribers += m.newSubscribers ?? 0;
  acc.unsubscribes += m.unsubscribes ?? 0;
}

// Finalize an accumulator into derived rates + recurring-inflation ratio.
export function finalizeMetrics(acc: ChannelMetrics): ChannelMetrics {
  const recurringInflation = acc.filteredRevenue
    ? acc.revenue / acc.filteredRevenue - 1
    : 0;
  return {
    ...acc,
    openRate: acc.sends ? acc.opens / acc.sends : 0,
    clickRate: acc.opens ? acc.clicks / acc.opens : 0,
    ctr: acc.sends ? acc.clicks / acc.sends : 0,
    conversionRate: acc.clicks ? acc.conversions / acc.clicks : 0,
    roi: acc.spend ? (acc.revenue - acc.spend) / acc.spend : 0,
    recurringInflation,
  };
}

// Recurring-order inflation as a percentage (how much raw revenue exceeds
// accurate/filtered revenue). 0 when no inflation.
export function computeRecurringInflationPct(
  rawRevenue: number,
  accurateRevenue: number,
): number {
  if (!accurateRevenue) return 0;
  return (rawRevenue / accurateRevenue - 1) * 100;
}

export function emptyMetrics(): ChannelMetrics {
  return { ...ZERO_METRICS };
}
