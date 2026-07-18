// Smoke tests for the pure metric + auth logic. Run with:
//   node --test apps/convex/__tests__/metrics.test.ts
// (Node 20+ built-in test runner; no extra deps.)
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  pctile,
  addMetrics,
  finalizeMetrics,
  computeRecurringInflationPct,
  emptyMetrics,
} from "../lib/metrics.ts";
import { hashPassword, verifyPasswordHash } from "../lib/password.ts";
import { ZERO_METRICS } from "@hiro/shared";

test("pctile: above median maps to 50-99", () => {
  assert.equal(pctile(0.73, 0.365), 90); // 2x -> 50 + 40 = 90
  assert.equal(pctile(0.1, 0.05), 90);
});

test("pctile: below median maps to 1-49", () => {
  assert.equal(pctile(0.055, 0.11), 50 - 20); // 0.5x -> 50 - 20 = 30
});

test("pctile: zero median returns 50", () => {
  assert.equal(pctile(5, 0), 50);
});

test("addMetrics + finalizeMetrics compute derived rates", () => {
  const acc = emptyMetrics();
  addMetrics(acc, { sends: 100, opens: 20, clicks: 5, conversions: 1, revenue: 50, filteredRevenue: 40, spend: 10 });
  const f = finalizeMetrics(acc);
  assert.equal(f.openRate, 0.2);
  assert.equal(f.clickRate, 0.25);
  assert.equal(f.conversionRate, 0.2);
  assert.equal(f.roi, 4); // (50-10)/10
  assert.ok(Math.abs(f.recurringInflation - 0.25) < 1e-9); // 50/40 - 1
});

test("computeRecurringInflationPct: raw > accurate => positive %", () => {
  assert.ok(Math.abs(computeRecurringInflationPct(100, 80) - 25) < 1e-9);
  assert.equal(computeRecurringInflationPct(100, 0), 0);
});

test("emptyMetrics is all zeros", () => {
  assert.deepEqual(emptyMetrics(), ZERO_METRICS);
});

test("argon2id hash + verify roundtrip", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.match(hash, /^argon2id\$t=\d+,m=\d+,p=\d+\$/);
  assert.equal(await verifyPasswordHash(hash, "correct horse battery staple"), true);
  assert.equal(await verifyPasswordHash(hash, "wrong password"), false);
});

test("argon2id rejects legacy SHA-256 hashes", async () => {
  // Old format (pre-Argon2id) must never verify, forcing a reset.
  assert.equal(await verifyPasswordHash("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", "x"), false);
});
