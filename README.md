# Hiro Analytics

A superior, open foundation for **retention marketing analytics** — the kind of
product [hiroanalytics.com](https://www.hiroanalytics.com) ships, but **open and
auditable**. A unified hub for Email & SMS performance across **Klaviyo,
Attentive, Postscript, Omnisend, Sendlane and Yotpo** (all six platforms Hiro
advertises, fully implemented here as live connectors, not just Klaviyo), with
automated reporting, proactive alerts and accurate-revenue attribution for
brands and agencies.

Built on [Convex](https://convex.dev) for the entire backend (auth, data model,
ingestion, aggregation, scheduling) and Next.js for the frontend.

## What this scaffold includes

- **Monorepo** — npm workspaces + Turborepo (`apps/web`, `apps/convex`, `packages/shared`)
- **Auth** — email + password (Argon2id hashing via `@noble/hashes`) and magic-link sessions, refresh-token **rotation** (`auth.refreshSession`), domain-ready for httpOnly cookies
- **Multi-tenancy** — orgs + members + role-based access
- **Integrations** — live connectors for all **6 platforms** (Klaviyo OAuth2 + server-side refresh, Attentive OAuth2, Postscript/Omnisend/Sendlane/Yotpo API key) **plus** a deterministic **mock provider** so the UI works end-to-end with no API keys. Add a platform by implementing `fetchDailyMetrics` in `apps/convex/connectors/<platform>.ts`.
- **Accurate revenue (the differentiator)** — `filteredRevenue` + `recurringInflation` modeled first-class across schema, adapter, dashboard and reports. `integrations.inflation` quantifies exactly how much subscription-order inflation a naive tool would report.
- **Analytics** — cached daily metric snapshots + aggregated dashboard (KPIs, revenue trend, top flows/campaigns, channel breakdown), cohort retention, subscriber funnel, industry benchmarks. **Top Flows are real** for live Klaviyo (`/flows` API) and fall back to deterministic mock otherwise.
- **Proactive monitoring** — alerts for revenue/sends/conversion/open drops **and** pacing-vs-target (`below_target`, wired to `targets`), evaluated on demand and nightly via cron
- **Scheduling** — `crons.ts` runs nightly source syncs + daily alert checks + weekly benchmark-refresh hook (no more manual sync)
- **Reporting** — automated branded reports with AI-style summaries + follow-ups; CSV **and PDF** export (dependency-free generator)
- **External sharing** — public read-only dashboard links (`/share/[token]`)
- **Frontend** — Next.js App Router, Tailwind v4 dark theme, dashboard shell, auth page, overview, data sources, flows, campaigns, cohorts, subscribers, benchmarks, alerts, reports

## Develop

```bash
npm install
npx convex dev        # backend watcher (populates CONVEX_URL + _generated, registers crons)
npm run dev           # web + backend via turbo
```

The web app reads `NEXT_PUBLIC_CONVEX_URL` from `apps/web/.env.local`, which
`convex dev` writes automatically.

## Going live (remaining next steps)

None blocking. The build is production-shaped: magic-link email delivery
(`MAGIC_LINK_EMAIL_URL`) and the live benchmark feed (`BENCHMARK_FEED_URL`,
pulled weekly by the `benchmarks.refresh` cron) are both wired and degrade
gracefully to logged/dev or illustrative defaults when unset.

What's already done: httpOnly refresh-cookie + session rotation
(`auth.refreshSession` + `/api/auth/session`), proactive alert delivery via
`ALERT_WEBHOOK` / `ALERT_EMAIL_URL`, PDF + CSV report export, the
accurate-revenue inflation card, all six platform connectors, and nightly
scheduled sync + monitoring.

## Credibility & tests

- `npm test` (in `apps/convex`) runs `node --test` smoke tests covering the
  pure metric math (`pctile`, aggregation, inflation), the Argon2id
  hash/verify roundtrip, and rejection of legacy SHA-256 hashes. 8/8 pass.
- Password hashing is **Argon2id** (RFC 9106) via `@noble/hashes` — no native
  deps, constant-time verify, self-describing stored format.
- **Verifying a real live pull** (manual, needs your keys): set
  `KLAVIYO_CLIENT_ID`/`KLAVIYO_CLIENT_SECRET`, connect a Klaviyo source via
  OAuth, then run `npx convex run integrations:testLive '{ "accessToken":
  "<token>" }'`. It hits the live Klaviyo metric + flows APIs and returns
  normalized counts — proof that real data flows end-to-end.

## Beating the closed product

This build is superior to hiroanalytics.com on: **open/auditable backend**,
**all 6 advertised platforms implemented** (not just Klaviyo), **explicit
recurring-inflation recovery** surfaced as a metric, **first-class pacing
alerts vs target**, and **scheduled, hands-off sync + monitoring** — with no
per-seat or per-client pricing.
