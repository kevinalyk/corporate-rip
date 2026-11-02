# Removed Reports Section: Reference for a Corporate Rebuild

The Reports section of RIP (the political product) was removed from Brand because every report was built around political concepts (party, WinRed/ActBlue, Republican vs. Democrat, FEC-style deadlines). This document records what each report was and how it worked, so a corporate version can be rebuilt without starting from zero.

The original code lives in RIP and in this repo's git history (the commit before the removal). Everything below is described at the level of "what would I need to rebuild this".

## Shared patterns across all reports

- **Route shape:** `app/[clientSlug]/reports/<name>/page.tsx`, wrapped in `AppLayout`, with sidebar entries under a "Reports" `NavSection`.
- **Plan gating:** a `hasReports` entitlement in `lib/subscription-utils.ts` (Professional and Enterprise only). Free and Basic plans saw a blurred static preview with a full-page upgrade overlay (lock icon, feature bullet list, "Upgrade Now" button to `/{clientSlug}/billing`). The APIs re-enforced this server-side (403 "Upgrade required") because the blur was cosmetic. Super admins always bypassed it.
- **Super admin client impersonation:** APIs accepted `clientSlug`, and a `super_admin` could resolve any client's id from it.
- **Common filters:** party, state, entity type, entity (multi-select, followed entities sorted first), house file vs. third party, and a from/to date range with a "Reset filters" button.
- **Data source:** all reports read from the shared engine tables (`CompetitiveInsightCampaign` for email, `SmsQueue` for SMS, `CiEntity` for the sender, `CIEmailCompliance` for compliance). Brand does not ingest data, so any corporate version reads the same tables filtered to `isCorporate = true` entities.
- **Charts:** `recharts` (area, bar, pie, line) plus simple stacked percentage bars made from divs.

---

## 1. Trends (`/reports/trends`)

**What it showed:** an "Analytics" overview: most active day, most active hour, content volume over time (email and SMS), and sends by party.

**How it worked:** the page only did plan gating and then rendered the shared `CompetitiveInsights` component with `defaultView="reporting"` and `isReportingView`. The paywalled version used hard-coded decorative data (never fetched) behind the blur.

**Corporate adaptation:** keep the stat cards and volume chart; replace "Sends by Party" with sends by industry or entity type (Media vs. Retail). The `CompetitiveInsights` component itself is still in the codebase (the Campaigns pages use it), so a new Trends page can reuse it.

## 2. Inboxing (`/reports/inboxing`)

**What it showed:** email placement and deliverability from seed-list data.

- **Overall Deliverability:** donut chart of inbox % vs. spam %.
- **Inbox Rate Over Time:** daily inbox and spam rate lines plus 7-day moving-average dashed lines.
- **Inbox Rate by Party:** Republican vs. Democrat daily inbox rate with 7-day averages.
- **Inbox Rate by Platform** (commented out in the source, kept for later): WinRed, ActBlue, Anedot, PSQ lines with 7-day averages.
- **House File vs. Third-Party Inbox Rate:** two lines with 7-day averages.

**Filters:** preset window (7D, 30D, 90D, 1Y) or custom date range, state, and an entity multi-select that only super admins saw. Refresh and Reset buttons.

**How it worked:** one call to `GET /api/ci/analytics?clientSlug&chartDays|fromDate&toDate&state&sender=...`. The route returns `inboxingData`, `inboxingTimeData`, `inboxingByPartyData`, `inboxingByPlatformData`, `inboxingByFileTypeData`. Each time series is built by bucketing campaigns per day, computing inbox/(inbox+spam), then adding a trailing 7-day average. The series are fetched with extra lead-in days so the first displayed point has a full average window, then trimmed to the display window.

**Status:** `app/api/ci/analytics/route.ts` is **still in the codebase** because `components/ci-analytics-view.tsx` uses it. A corporate Inboxing page can call it directly.

**Corporate adaptation:** replace the party chart with a Media vs. Retail (or per-industry) comparison. The platform chart is political-only (donation platforms) and can be dropped. House file vs. third party translates directly.

## 3. Copy Frequency (`/reports/content`)

**What it showed:** the most repeated copy across all senders, in three tabs: Email Subjects, Email Body, SMS Copy. Each row has rank, the subject or message preview, the sending entity with a party badge, the number of "send days", and last sent date. A repeated message is treated as a signal that the copy is working. Paywalled to Professional and Enterprise (`all` / `enterprise` plans) or super admin.

**How it worked:** `GET /api/reports/content-frequency` runs three raw SQL queries in parallel (subjects, email bodies via `bodyFingerprint`, SMS bodies via `bodyFingerprint`).

- Each query groups by subject (or fingerprint) plus entity and counts `DISTINCT DATE_TRUNC('hour', dateReceived)` as "send days". Only groups with more than 1 distinct hour are kept.
- A second CTE uses `DISTINCT ON` to pick the most recent example row per group (id, share token, preview). The subject and SMS queries also extract a donation URL from `ctaLinks` JSON (WinRed or ActBlue only).
- Filters: party, source (house = `source = 'seed'`, third party = `source = 'personal'`), entity, date range, limit up to 100.
- Results are cached in memory for 5 minutes by a key built from the filter set (`lib/content-frequency-cache.ts`, with a version string you bump when the response shape changes).
- `GET /api/reports/content-frequency/sends` lists up to 100 individual sends for a subject, email body, or SMS fingerprint. It lazily creates a `shareToken` (nanoid) for any send missing one so each row can link to a shareable public view.
- UI: tabs, filter bar, expandable rows. Subject and SMS rows open the latest message directly; email-body rows expand to show all sends.

**Corporate adaptation:** the SQL is fully reusable. Drop the WinRed/ActBlue donation URL extraction (or swap it for the product or landing-page link) and the party filter. The `bodyFingerprint` and share-token approach is what makes this cheap, so keep it.

## 4. Subject Patterns (`/reports/subject-patterns`)

**What it showed:** how often each subject-line pattern appears and how well each lands in the inbox.

- **Subject Line Pattern Breakdown:** frequency per pattern (short, urgency, number/$, question, all caps, emoji, personalization, etc.) with a Republican / Democrat / Other stacked share bar.
- **Inbox Rate by Pattern:** table comparing each pattern's inbox rate to the overall baseline, with up to 10 real example subjects per pattern.

**How it worked:** `GET /api/ci/subject-patterns` loads every non-deleted, non-hidden campaign matching the filters (entity names, party, state, date range) and classifies the **raw** subject (so merge tags like `{{Name}}` are intact) with `classifySubjectLine` from `lib/subject-line-classifier.ts`. For each pattern it tallies count, share of corpus, party split, inbox and spam totals, avg inbox rate = inbox / (inbox + spam), and the 10 most recent examples. It also returns an overall inbox rate used as the baseline. Output is sorted by count.

**Status:** `lib/subject-line-classifier.ts` is **still in the codebase** (used at ingestion time to store `subjectPatterns` on each campaign).

**Corporate adaptation:** the patterns themselves are mostly generic (length, question, emoji, personalization, numbers). Replace "urgency" language with promo patterns (percent off, free shipping, limited time, new arrival) and swap the party split for Media vs. Retail.

## 5. Message Types (`/reports/message-types`, super admin only)

**What it showed:** AI-classified intent of each message (fundraising ask, urgency/deadline, match offer, survey/poll, attack/opposition, news update, and others), with frequency, party split, and inbox rate per type, plus examples.

**How it worked:** `GET /api/ci/message-types` is the same shape as Subject Patterns but reads the stored `messageTypes[]` array on each campaign (set by `lib/message-classifier.ts` at ingestion), and only includes campaigns that have been classified. It returns `total` (full corpus), `classifiedTotal`, `overallInboxRate`, and per-type stats with labels from `MESSAGE_TYPE_LABELS`. Extra filter: entity type.

**Status:** `lib/message-classifier.ts` is **still in the codebase**.

**Corporate adaptation:** this is where most of the new work is. Define a corporate taxonomy (promotion, product launch, abandoned cart, back in stock, newsletter, event, loyalty, survey) in the classifier, re-run classification for corporate entities, and the report works unchanged.

## 6. Sender Comparisons (`/reports/comparisons`, super admin only)

**What it showed:** a leaderboard of top senders (default 50, max 200) that can be sorted by volume, inbox rate, email count, SMS count, or cadence. Click a row to expand details; select up to 2 senders for a side-by-side panel (Total Volume, Emails, SMS, Avg Inbox Rate, Avg Send Cadence, Top Donation Platform, plus top subject patterns and message types).

**How it worked:** `GET /api/ci/comparisons` loads matching `CiEntity` rows with their campaigns and processed SMS in the date window, then builds one profile per entity:

- volume = emails + SMS, and an email/SMS ratio
- avg inbox rate across all campaigns
- cadence = mean gap in days between consecutive emails
- top donation platform by count
- top 3 subject patterns and top 3 message types (count and % of emails)
- up to 5 "strategy chips" computed from thresholds, for example Match-Heavy (>15% match offers), Urgency-Driven (>20%), Fundraising-Focused (>50%), Survey-Heavy, News-Driven, High Personalization (>30%), Emoji-Heavy, Question-Led, High Frequency (cadence under 1.5 days), Low Frequency (over 7), Strong Inbox (over 80%), Spam Prone (under 40%)
- the 5 most recent subjects

**Filters:** party, entity type, state, house file vs. prospecting (`isThirdParty`), date range.

**Corporate adaptation:** very reusable. Swap the chip rules for corporate ones (Promo-Heavy, Discount-Driven, Daily Sender, etc.) and replace "donation platform" with something meaningful (ESP, or top call-to-action domain).

## 7. Email Compliance Summary (`/reports/compliance`)

**What it showed:** Republican vs. Democrat compliance and inbox analysis from stored per-email compliance checks. Sections:

- Per-party summary cards with total inbox/spam and an average compliance score
- **Authentication Metrics:** SPF, DKIM, TLS, DMARC, 1-click unsubscribe, unsubscribe link in body (pass rates)
- **Section Score Breakdown:** four scored sections: (1) All senders: SPF, DKIM, TLS, Message-ID, ARC; (2) Bulk senders: SPF+DKIM, DMARC, 1-click unsub; (3) Content: from address, subject, hidden content; (4) Display name: no impersonation or deceptive patterns
- **Individual Campaign Results:** paginated table with per-section score badges (green 85%+, yellow 65%+, red below)
- Clicking any metric or section filters the table to the emails that **failed** that check

**How it worked:** `GET /api/reports/compliance-summary?entityId&page&pageSize&filterType&filterCheck&filterPlacement&filterSection` reads `CIEmailCompliance` rows joined to their campaign and entity. It returns the paginated rows plus aggregate stats for the entity (rates for each boolean check, average section scores, and a total score computed as the mean of the four sections rather than the stored `totalScore`, which could be stale). Requires the `all` or `enterprise` plan, or the `rip` client, or super admin.

**Status:** the `CIEmailCompliance` table and the process that populates it are **still in the engine**. Only the UI and these two routes were removed.

**Corporate adaptation:** the checks are not political at all (they are standard Gmail/Yahoo bulk-sender requirements), so this is the most portable report. Replace the party split with Media vs. Retail or per-brand comparison.

## 8. Legacy "Reporting Dashboard" (not in the sidebar)

`components/reporting-content.tsx`, rendered by `main-content.tsx` for the old `reporting` tab and fed by `/api/reporting`. It showed total campaigns, average delivery and inbox rate, total emails, a Provider Health radial chart, Deliverability Trends lines, a Provider Performance inbox/spam bar chart by mailbox provider, and a Recent Campaigns table. Removed along with the Reports section because it was an unreachable remnant. The mailbox-provider breakdown (Gmail vs. Outlook vs. Yahoo) is the one idea worth keeping for corporate.

---

## What was deliberately kept

- `app/api/ci/analytics/route.ts` and `components/ci-analytics-view.tsx` (used elsewhere)
- `components/competitive-insights.tsx` (used by the Campaigns pages)
- `lib/subject-line-classifier.ts` and `lib/message-classifier.ts` (ingestion-time classification)
- The `hasReports` plan flag in `lib/subscription-utils.ts` (still referenced by `/api/ci/analytics`; reuse it to gate a future corporate Reports section)
- All database tables and columns the reports read from
