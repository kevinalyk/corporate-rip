# brandinbox.ai - Strip and Corporate-Scope Plan

Status: planning only. Nothing in this document has been executed yet.
Written from a read-through of the codebase as cloned from `kevinalyk/corporate-rip` (main).

## 1. What we are building

This codebase is currently RIP (political email/SMS competitive intelligence). brandinbox.ai is the
corporate sibling of that product. The agreed model:

- RIP's side owns everything that creates data: email/SMS ingestion, seed inboxes, campaign detection,
  entity assignment, redaction, link unwrapping, classification, enrichment.
- The shared database therefore holds political AND corporate data.
- This app is a read-mostly front end that is "fed" by that database. New emails that RIP's team
  assigns to a corporate entity should appear here automatically, with no action on this side.
- This app filters out everything political. No candidates in the directory, no political emails or
  texts in the feed, and so on.
- The CI feed is renamed (name TBD).

What stays at launch:

1. Directory
2. Feed (the CI feed, renamed)
3. Following
4. Settings / user information

What may come back later (do not delete from history, just remove from the build): reporting, MCP,
and "a few others" still to be decided. See section 6 ("Parked").

## 2. Size of the job

Measured from the repo as it is today:

| Area | Count |
| --- | --- |
| API route handlers (`app/api/**/route.ts`) | 306 |
| - `admin` | 91 |
| - `cron` | 28 |
| - `mobile/v1` | 21 |
| - `ci` | 17 |
| - `slack` | 12 |
| - `seedlist` | 12 |
| - `auth` | 11 |
| Pages under `app/[clientSlug]/` | ~56 files (47 page routes) |
| `lib/` | ~28k lines |
| `components/` (excluding `ui/`) | ~36.7k lines |
| `scripts/` | 158 one-off SQL / TS / MJS files |
| `prisma/migrations` | 47 files |
| Prisma models | ~60 |
| Crons in `vercel.json` | 28 entries |

Roughly 85-90% of the repo is ingestion, ops, billing, deliverability and admin tooling that the new
product does not need.

Largest files (these are the ones that carry the political assumptions and need rewriting or heavy
trimming rather than simple deletion):

| File | Lines | Notes |
| --- | --- | --- |
| `lib/ci-entity-utils.ts` | 2555 | Entity auto-assignment (writer) mixed with read helpers |
| `lib/competitive-insights-utils.tsx` | 2210 | Feed helpers, AI usage |
| `lib/mailgun.tsx` | 2112 | Outbound email templates for every notification type |
| `components/admin-content.tsx` | 4045 | Pure admin, delete |
| `components/main-content.tsx` | 3818 | Original deliverability dashboard, delete |
| `components/competitive-insights.tsx` | 3342 | THE feed and Following UI. Keep, but heavily trim |
| `components/ci-entity-management.tsx` | 3094 | Admin entity editor, delete |
| `components/ci-directory-content.tsx` | 1036 | Directory UI. Keep, trim political filters |
| `components/directory-profile-content.tsx` | 715 | Directory profile. Keep, trim |

## 3. Safety items to do FIRST (before any stripping)

These matter because this project now shares environment variables, and likely the database, with RIP.

1. **Tag the current state** (`git tag pre-strip-snapshot`) so every parked feature is one checkout away.
2. **Empty the `crons` array in `vercel.json`.** All 28 crons are RIP writers. If this project is
   promoted to production with its current `vercel.json` and RIP's `DATABASE_URL`, `CRON_SECRET` and
   Mailgun keys, it will run a second copy of every ingestion/cleanup job against RIP's data. Several are
   destructive or user-visible:
   - `purge-old-ci-data` deletes rows
   - `redact-names`, `unwrap-links`, `auto-assign-unassigned`, `resolve-sending-providers` mutate rows
   - `engage-rip-seeds`, `simulate-engagement`, `click-domain-health-emails`,
     `auto-reply-verified-domains` send mail and click links
   - `twitter-post`, `product-update`, `weekly-digest`, `digest-following` send external messages
3. **Delete or disable the inbound webhooks** (`webhooks/inbound-email`, `webhooks/mailgun-parse`,
   `webhooks/fullstack-sms`). Only one deployment should receive RIP's mail and SMS.
4. **Delete `app/api/update-schema/route.ts`, `app/api/test/*`, `app/api/debug/*`, `app/debug`, `app/testpage`.**
   These are ops/diagnostic endpoints, and `update-schema` can alter the shared schema.
5. **Do not run `prisma migrate` or `prisma db push` from this repo.** RIP owns the schema. The build script
   only runs `prisma generate`, which is fine. Remove `prisma/migrations` once the schema is pulled in
   a read-only form (see section 4.3).
6. **Use a read-only database role for this app** wherever it reads RIP-owned tables (see 4.3).
7. **Give this app its own secrets.** `JWT_SECRET`, `MOBILE_JWT_SECRET`, `ENCRYPTION_KEY` and
   `INTERNAL_API_SECRET` were copied from RIP. If they match, tokens and encrypted values are
   interchangeable between the two apps. Generate new values for brandinbox unless sharing is intended.

## 4. Target architecture

### 4.1 Data flow

```
RIP (writer)                         shared Postgres                  brandinbox.ai (reader)
ingest / assign / redact  --->  CiEntity, CompetitiveInsightCampaign,  --->  corporate-scope filter
                                SmsQueue, CiEntityMapping, ...               then Directory / Feed / Following
```

### 4.2 One chokepoint for "corporate only"

Today the equivalent exclusion is scattered. For example `lib/services/feed-service.ts`
(`entityAttributeWhere`) and `lib/services/directory-service.ts` (`directoryWhere`) both hard-code
`type: { not: "data_broker" }`, and a comment in feed-service documents a past bug where a caller-supplied
`entityType` filter clobbered that exclusion. We should not repeat that.

Proposal: a single module, e.g. `lib/corporate-scope.ts`, that exports Prisma `where` fragments:

- `corporateEntityWhere` for `CiEntity`
- `corporateCampaignWhere` for `CompetitiveInsightCampaign` (via `entity: corporateEntityWhere`, plus
  `isDeleted: false`, `isHidden: false`)
- `corporateSmsWhere` for `SmsQueue`

Rules:

- Every query that returns entities, campaigns or SMS composes these with `AND`. Caller filters can narrow
  but never replace them.
- Use an allowlist (corporate entities only), not a denylist of political types. New political entity
  types added on RIP's side must not leak by default.
- Unassigned items (`entityId = null`) are excluded from the feed. We cannot tell whether they are political.
- Add tests that assert no political entity, campaign or SMS can be returned by any list, detail, search,
  share or public endpoint.

### 4.3 What needs to exist on RIP's side

The current schema has no way to say "this entity is corporate":

- `CiEntity.type` takes values like `candidate`, `politician`, `pac`, `organization`, `nonprofit`, `jfc`,
  `state_party`, `data_broker` (seen in `directory-service.ts` and the admin entity editor).
- `party`, `state`, `office`, `ballotpediaUrl`, `donationIdentifiers` are political-shaped.
- `organization` is ambiguous: it is used today for political organizations.

Ask RIP's team for one explicit discriminator, for example a `sector`/`isCorporate` column, or a new
`type` value such as `company`. Two ways to deliver it, in order of preference:

1. **Database views** owned by RIP (`corporate_entities`, `corporate_campaigns`, `corporate_sms`) and a
   read-only role granted only on those views. Political data cannot leak even if app code is wrong.
2. **Column plus app-side filter** (4.2). Simpler, but the whole `public` schema is readable by this app.

Either way this app should keep its own data (users, clients, follows, settings) separate from RIP's
tables, preferably in its own Postgres schema (e.g. `brandinbox`) so that a read-only role on RIP's
tables is still possible. See open question Q2.

### 4.4 Automatic updates

Because the feed and directory are plain reads from the shared database, "new emails show up on their own"
needs no new code on this side beyond:

- not caching too aggressively (use short revalidation, or SWR polling on the feed)
- keeping `FREE_TIER_DELAY_HOURS` style delays only if the plan model survives (Q3)

## 5. KEEP (core, rebrand and trim)

### 5.1 Directory

Public:
- `app/directory/page.tsx`, `app/directory/[slug]/page.tsx`, `app/directory/[slug]/[secondSlug]/page.tsx`,
  `app/directory/layout.tsx`
- `app/api/public/directory/[slug]/route.ts`, `app/api/public/ci-entities/route.ts`
- `lib/directory.ts`, `lib/directory-routing.ts`, `lib/directory-utils.ts`, `lib/services/directory-service.ts`,
  `lib/services/entity-service.ts`
- `components/json-ld.tsx` (rewrite the schema.org types, currently candidate-oriented)

In-app:
- `app/[clientSlug]/ci/directory/page.tsx`, `components/ci-directory-content.tsx`,
  `components/directory-profile-content.tsx`, `components/related-entities.tsx`,
  `app/api/related-entities-count/route.ts`, `app/api/entity-tags/route.ts` (read-only use),
  `components/entity-tag-manager.tsx` (remove the edit UI)

Political parts to remove from these files:
- party filter, state filter and the "unknown party" logic (`partyWhere`, `MOBILE_DIRECTORY_PARTIES`)
- political entity type labels (Candidates, Politicians, PACs, JFCs, State Parties)
- Ballotpedia fields in the select lists (`office`, `ballotpediaUrl`, `bio` if it is Ballotpedia-sourced)
- `app/directory/new-campaigns/page.tsx` and `components/new-campaigns-filters.tsx` (political launch feed;
  decide whether a corporate equivalent is wanted)
- `public/og-candidate-directory.png` (replace)

Entity photos (your note): the only storage requirement is the `entity-photos/` path. Today it is written by
`app/api/ci-entities/route.ts` (admin edit, `put("entity-photos/<id>-<ts>.<ext>")`) and by the Ballotpedia
scraper/refresh crons. See Q5 for how to handle this without carrying over the old images.

### 5.2 Feed (renamed)

- Route: `app/[clientSlug]/ci/campaigns/page.tsx` (sidebar label "Feed"). Rename the route and label.
- UI: `components/competitive-insights.tsx` (3342 lines). This also powers Following, so it is shared.
- Data: `app/api/competitive-insights/route.ts` (+ `[id]`, `similar`, `senders`, `suggestions`, `preview`,
  `[id]/hide`), `lib/services/feed-service.ts`, `lib/competitive-insights-utils.tsx`,
  `lib/ci-content-search.ts`, `lib/ci-mapping-cache.ts`, `lib/content-frequency-cache.ts`
- Saved views: `app/api/ci-views/route.ts`, `components/ci-views-manager.tsx`, `CiView` model (this is app-owned data)
- Share links: `app/api/ci-campaigns/[id]/share/route.ts`, `app/share/[token]`, `app/api/share/[token]`,
  `app/api/og/share/[token]*` (decide in Q9; OG generation uses `puppeteer-core` and `@sparticuz/chromium`)

Political parts to remove from the feed:
- party / state / house-file vs third-party filters (`houseFileFilter`, `partyFilter`, `stateFilter`,
  `entityTypeFilter` political values)
- donation platform badges and filters (`donationPlatform`: winred, actblue, anedot, psq)
- the "Politician / PAC / Committee" tags concept in `CompetitiveInsightCampaign.tags`
- any "Republican / Democrat" copy and colours
- the free-tier delay and history-window logic, if plans are dropped (Q3)

Write operations to cut from the feed API: `hide`, `delete`, admin actions. Hiding a message is a RIP-side
decision (`isHidden` already exists in the shared table; this app only respects it).

### 5.3 Following

- Route: `app/[clientSlug]/ci/subscriptions/page.tsx`
- API: `app/api/ci/subscriptions/route.ts`, `toggle`, `check` (and `check-all` if still needed)
- UI: `components/ci-entity-subscribe-button.tsx`, shared `competitive-insights.tsx`
- Data: `CiEntitySubscription` (app-owned: per user and client, references `entityId`)
- Optional: `app/api/cron/digest-following/route.ts` is the daily "what your followed entities sent" email.
  If wanted, keep it here, but it is a reader of the shared data and a sender of mail, so it needs the new
  Mailgun domain first.

Follow only allows corporate entities: validate `entityId` against `corporateEntityWhere` on write.

### 5.4 Settings / user information

- `app/[clientSlug]/account/settings/page.tsx` (daily digest, weekly digest, product update toggles)
- `app/api/settings/route.ts`, `app/api/user/settings/route.ts`
- Auth: `app/login`, `app/signup`, `app/reset-password`, `app/set-password`, `app/accept-invitation`,
  `app/finish-account`, `app/api/auth/*` (11 routes, drop `gsc` callbacks), `lib/auth.ts`, `lib/lookup-auth.ts`
  (only if lookup stays), `middleware.ts` (rewrite the public-path allowlist)
- Users: `app/[clientSlug]/account/users/page.tsx`, `app/api/users/*`, `app/api/clients/*` (Q3, Q4)
- Shell: `components/app-layout.tsx`, `components/sidebar.tsx` (932 lines; reduce to the four items),
  `components/footer.tsx`, `components/logo.tsx`, `components/brand-wordmark.tsx`,
  `components/cookie-consent-banner.tsx`, `components/theme-provider.tsx`, `components/ui/*`
- Static pages: `app/page.tsx`, `app/about`, `app/privacy`, `app/terms` (rewrite copy for brandinbox)

## 6. PARKED (likely to come back; remove from the build, keep in the snapshot tag)

| Feature | Where it lives | Notes |
| --- | --- | --- |
| Reporting | `app/[clientSlug]/ci/reporting`, `app/[clientSlug]/reports/*` (7 pages), `app/api/reporting`, `app/api/reports/*`, `app/api/ci/analytics`, `comparisons`, `message-types`, `subject-patterns`, `components/reporting-content.tsx`, `ci-analytics-view.tsx`, `ci-comparisons-view.tsx`, `ci-message-types-view.tsx`, `ci-subject-patterns-view.tsx`, `content-frequency.tsx`, `compliance-report-content.tsx` | Reads data RIP already produces (`messageTypes`, `subjectPatterns`, compliance). Needs the same corporate filter |
| MCP | `app/[clientSlug]/developers/mcp*`, `app/api/client-mcp/*`, `app/api/mcp/ci-assignment`, `lib/client-mcp*.ts`, `ClientMcp*` models, deps `@modelcontextprotocol/sdk`, `mcp-handler` | `ci-assignment` is a RIP-side admin tool, not a customer MCP. Do not bring it back |
| Public API and API keys | `app/api/v1/*` (8 routes), `app/[clientSlug]/developers/api-keys`, `lib/api-auth.ts`, `lib/ci-api-auth.ts`, `ApiKey` model | Same corporate filter on every v1 route |
| Slack alerts | `app/api/slack/*` (12 routes), `lib/slack-*.ts`, `components/slack-*.tsx`, `app/[clientSlug]/account/integrations` | Has political filters baked into the schema (party, state, entity type) |
| Mobile app API | `app/api/mobile/v1/*` (21 routes), `lib/mobile-auth.ts`, `lib/services/mobile-*.ts` | Only if a brandinbox mobile app is planned |
| Lookup | `app/lookup/*`, `app/api/lookup/*`, `LookupSearch` | Needs a read to confirm what it is for (Q10) |
| Digest / News | `app/digest/*`, `app/news/*`, `app/api/digest`, `app/api/announcements`, `DigestArticle`, `Announcement` | Content is RIP editorial. Reuse only with new content |
| Saved alerts | `app/api/campaign-alerts/*`, `CampaignAlertSubscription` | |
| US map | `app/[clientSlug]/ci/map`, `components/us-interactive-map.tsx`, `app/api/ci/map-*`, `app/api/public/map-*` | Political (state races). Corporate has no equivalent unless "HQ state" is wanted |

## 7. STRIP (remove for good)

### 7.1 Scheduled jobs (`app/api/cron/*`, 28 routes)

Remove all of them from `vercel.json` immediately. Delete these route files:

- Ingestion / assignment: `process-emails`, `detect-campaigns`, `detect-competitive-insights`,
  `check-all-campaigns`, `auto-assign-unassigned`, `resolve-sending-providers`, `unwrap-links`,
  `redact-names`, `purge-old-ci-data`, `cleanup-old-results`, `cleanup-placeholder-images`
- Seeds / deliverability: `check-seed-emails`, `engage-rip-seeds`, `simulate-engagement`,
  `simulate-domain-health-engagement`, `click-domain-health-emails`, `domain-health-scan`,
  `auto-reply-verified-domains`, `check-email-compliance`, `winred-inbox-scan`
- Political enrichment: `scrape-fec-launches`, `refresh-ballotpedia`
- Marketing / SEO: `twitter-post`, `gsc-index`, `product-update`, `weekly-digest`
- Billing: `expire-trials` (unless trials survive)
- Review (possible keep): `digest-following` (see 5.3)

### 7.2 Webhooks

`webhooks/inbound-email`, `webhooks/mailgun-parse`, `webhooks/fullstack-sms`, `webhooks/stripe`,
`webhooks/stripe-ci` (the two Stripe ones go or stay with the billing decision, Q3).

### 7.3 Pages

- `app/[clientSlug]/admin/*` (17 pages): accounts, automation-api, blocked-domains, cancellation-feedback,
  changelog, ci-entities, compliance, dashboard, name-redaction, personal-assignments,
  personal-email-domains, seed-insights, sender-providers, seo-dashboard, site-traffic, tools, winred-inbox
- `app/[clientSlug]/inbox/*` (domain-health, seed-list, spam-test, layout)
- `app/[clientSlug]/ci/personal`, `ci/personal-numbers`
- `app/[clientSlug]/ci-entities` (client-side entity management; confirm before deleting)
- `app/[clientSlug]/insights` (confirm; likely a RIP-era dashboard)
- `app/billing`, `app/[clientSlug]/billing`, `app/[clientSlug]/account/billing` (only if billing is dropped, Q3)
- `app/debug`, `app/testpage`

### 7.4 API routes

- `app/api/admin/*` (91 routes). Includes all backfills, sanitizers, reassigners, Ballotpedia scrapers,
  `assign-*` one-offs for specific senders, Twitter posting, trial codes, dkim/ip mappings, redaction
- `app/api/seedlist/*` (12), `app/api/spam-test/*`, `app/api/domain-health/*`, `app/api/client-domains/*`,
  `app/api/blocked-domains/*`, `app/api/domains`
- `app/api/campaigns/*` (8): original deliverability campaign tracker, not the CI feed
- `app/api/ci-entities/*` (7): entity assignment and editing, which is RIP's job now (note the entity-photo
  upload lives in `ci-entities/route.ts`, see Q5)
- `app/api/ci/personal*`, `request-email-seed`, `request-phone-number`, `cancel-phone-number`,
  `app/api/ci/map-*`
- `app/api/oauth/microsoft/*`, `app/api/auth/gsc/*`, `app/api/track/click`, `app/api/track-view`
  (decide if view counts should still be written to a shared table)
- `app/api/guides/seed-setup-guide`, `app/api/support/ticket` (replace with a simple mailto or new endpoint),
  `app/api/stripe/reactivate`, `app/api/billing/*` (if billing goes)
- `app/api/test/*`, `app/api/debug/*`, `app/api/update-schema`

### 7.5 `lib/` files

Strip (RIP-side ingestion or deliverability):
`campaign-detector.ts`, `email-checker.ts`, `email-processor.ts`, `email-connection.ts`,
`email-compliance-checker.ts`, `email-filters.ts`, `email-tracking.ts`, `engagement-simulator.ts`,
`link-click-simulator.ts`, `domain-health-scanner.ts`, `auto-reply-sender.ts`, `seed-email-utils.ts`,
`seed-utils.ts`, `winred-inbox-scanner.ts`, `microsoft-graph.ts`, `microsoft-oauth.ts`,
`outlook-connection.ts`, `ip-sender-utils.ts`, `sms-link-extractor.ts`, `sms-redaction.ts`,
`redaction-utils.ts`, `body-fingerprint.ts`, `detect-donation-platform.ts`, `tracking-pixel.ts`,
`ballotpedia-enrich.ts`, `ballotpedia-state-scraper.ts`, `message-classifier.ts`,
`subject-line-classifier.ts`, `reply-classifier.ts`, `gsc.ts`, `ga4.ts`, `ads.ts`,
`trending-entities.ts` (re-evaluate), `ci-api-notifications.ts`.

Split, do not delete: `lib/ci-entity-utils.ts` (2555 lines) mixes auto-assignment (strip) with read helpers
the feed uses (keep). `lib/mailgun.tsx` (2112 lines) holds every email template; keep only password reset,
invitation and the follow digest. `lib/competitive-insights-utils.tsx` (2210 lines) has the same mix.
`lib/prisma.ts` (262 lines) should be reviewed for write helpers and RIP-specific connection handling.

Keep: `lib/auth.ts`, `lib/prisma.ts`, `lib/utils.ts`, `lib/get-origin.ts`, `lib/encryption.ts`,
`lib/domain-context.tsx` (review), `lib/hooks`, `lib/feature-flags.ts`, `lib/subscription-utils.ts`
(only if plans stay), `lib/services/{authz,user-service,entity-service,directory-service,feed-service}.ts`.

### 7.6 Components

Delete: `admin-*.tsx` (6), `main-content.tsx`, `ci-entity-management.tsx`, `seed-list-content.tsx`,
`domain-health-content.tsx`, `spam-test-content.tsx`, `deliverability-score-card.tsx`,
`campaign-detection-dialog.tsx`, `competitive-insights-detection-dialog.tsx`, `campaign-alert-dialog.tsx`,
`personal-email-content.tsx`, `personal-numbers-content.tsx`, `site-traffic-content.tsx`,
`seo-dashboard-content.tsx`, `ad-banner.tsx`, `ad-sidebar.tsx`, `ci-pricing-content.tsx` and
`plan-selection-content.tsx` and `billing-content.tsx` and `paywall-overlay.tsx` and
`trial-status-banner.tsx` (if plans go), `inbox-coming-soon.tsx`, `report-problem-dialog.tsx` (review),
`cancellation-feedback-fields.tsx`, `news-article-image.tsx`, `trending-entities-card.tsx` (review).

### 7.7 Schema, scripts, docs, assets

- **Prisma schema** (1479 lines): reduce to the models this app reads, plus its own. Read from RIP:
  `CiEntity`, `CiEntityMapping`, `CompetitiveInsightCampaign`, `SmsQueue`, `EntityTag`.
  Owned here: `User`, `Client`, `CiEntitySubscription`, `CiView`, and whichever invitation/session tables survive.
  Remove everything else from this app's schema file (deliverability, seeds, Slack, mobile, MCP,
  Stripe seat/trial tables, DKIM/IP mappings, redaction, Twitter, SEO). Removing a model from this schema
  file never drops a table, as long as no migration is run.
- **`scripts/`**: all 158 files are one-off RIP data fixes and migrations. Delete the folder (keep
  `generate-prisma-client.js` if the build needs it).
- **`prisma/migrations`** (47 files): delete from this repo; RIP owns the history.
- **`docs/plans/`**: RIP planning docs (MCP, public API, reporting, seats, cursor pagination, performance).
  Move to a `docs/rip-archive/` folder or delete. Some are useful when parked features return.
- **Root**: `updates.txt`, `claude-digest-instructions.pdf`, `public/exports`, `public/guides`, the Google
  verification files, `ads.txt`, and any RIP-branded images.
- **Tests**: `lib/__tests__` and `lib/services/__tests__` mostly cover mobile, Stripe and entity utils.
  Keep or rewrite only those covering feed, directory and entities; add corporate-scope tests.
- **`package.json`**: rename from `rip-email-tool`, and prune the `test:*` scripts that point to deleted files.

### 7.8 Dependencies to drop after the strip (verify imports first)

`@sparticuz/chromium`, `puppeteer-core` (OG screenshots, if share is parked), `imap`, `node-imap`,
`mailparser`, `nodemailer` (if Mailgun is the only mailer), `@azure/msal-node`,
`@microsoft/microsoft-graph-client`, `googleapis`, `@google-analytics/data`, `pdfkit`, `openai`, `ai`,
`@ai-sdk/openai` (only needed for classification and entity auto-assignment), `csv-parse`,
`@modelcontextprotocol/sdk` and `mcp-handler` (parked), `d3-geo`, `react-simple-maps`, `@types/d3-geo`
(map, parked), `stripe` (if billing goes), `@vercel/connect` (confirm what it is used for).

## 8. Environment variables brought over from RIP

| Variable(s) | Used by | Plan |
| --- | --- | --- |
| `DATABASE_URL` | everything | Keep. Prefer a read-only role for RIP tables (4.3) |
| `BACKUP_DATABASE_URL` | no code reference found | Remove |
| `BLOB_READ_WRITE_TOKEN` | entity photos, OG images, announcements, guides | New Blob store connected to this project (done); keep only for entity photos |
| `CRON_SECRET` | 26 files (all crons) | Remove once crons are gone |
| `JWT_SECRET` | 20 files | Keep, but rotate to a brandinbox-specific value |
| `MOBILE_JWT_SECRET` | 2 files | Remove unless mobile returns |
| `ENCRYPTION_KEY`, `INTERNAL_API_SECRET` | 3 files each | Review per use; rotate |
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_WEBHOOK_SIGNING_KEY` | 11 files | You flagged these as changing. Keep the sender keys, drop the webhook signing key |
| `STRIPE_*`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_MCP_KEY` | billing | Decision Q3 |
| `SLACK_CLIENT_ID/SECRET` | Slack | Parked |
| `MICROSOFT_*` | seed inbox OAuth | Remove (RIP-side) |
| `TWITTER_*` (7) | Twitter posting | Remove |
| `GA4_*`, `GSC_*`, `INDEXNOW_KEY` | analytics/SEO | Remove for now; add back with brandinbox-specific properties |
| `FEC_API_KEY` | FEC launch scraper | Remove |
| `FULLSTACK_WEBHOOK_KEY` | SMS webhook | Remove |
| `DIGEST_API_KEY` | digest content API | Remove or park |
| `REVALIDATE_SECRET` | no code reference found | Remove |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | no code reference found | Remove |

## 9. Proposed phases

**Phase 0: safety** (section 3). Tag, empty crons, remove webhooks and `update-schema`, rotate secrets.

**Phase 1: scope layer.** Agree the corporate discriminator with RIP's team. Add `lib/corporate-scope.ts`
and tests. Route every read path for entities, campaigns and SMS through it.

**Phase 2: delete the obvious.** Admin pages and routes, inbox tools, seed list, campaigns, personal
email/numbers, crons, debug/test, `scripts/`, `prisma/migrations`. Rebuild after each batch.

**Phase 3: rebuild the four features.**
1. Sidebar reduced to Directory, Feed (new name), Following, Settings.
2. Feed and Following: trim `competitive-insights.tsx`, remove political filters, apply scope.
3. Directory: public and in-app, remove party/state/Ballotpedia, apply scope.
4. Settings and users: keep digests and profile; apply Q3/Q4 decisions.

**Phase 4: park.** Move parked code out of the build (delete from the tree, rely on the snapshot tag, or keep
under `docs/rip-archive/`). Prune the Prisma schema and dependencies.

**Phase 5: rebrand copy and SEO.** `app/page.tsx`, about/privacy/terms, metadata, JSON-LD, OG images,
emails, sitemap, `robots.txt`, sender names.

**Phase 6: verify.**
- Leak test: for each list/detail/search/share/public endpoint, confirm a known political entity, email and
  SMS are not returned, including with crafted query params (`entityType`, `entityId`, `party`).
- Grep for removed imports and any remaining `winred`, `actblue`, `candidate`, `ballotpedia`, `party`,
  `republican`, `democrat`, `inbox.gop` strings.
- `pnpm build` and `pnpm lint` clean; run the app and exercise the four features in the browser.

## 10. Open questions

- **Q1. Corporate discriminator.** What field marks an entity as corporate on RIP's side (new `type`, a
  `sector` column, a boolean, a view)? Everything in section 4 depends on this. Recommended: RIP exposes
  views plus a read-only role.
- **Q2. Where do users live?** This app keeps "settings/user information". Should its users be in the
  same database as RIP's users (shared accounts, shared logins), the same database but a separate schema,
  or a separate database? Recommended: separate schema (or database) so RIP accounts and brandinbox
  accounts cannot be confused, and RIP tables can be read-only.
- **Q3. Plans and billing.** Is Stripe billing, the free-tier delay (`FREE_TIER_DELAY_HOURS`), history limits
  and trials staying? That decides about 15 files and the `Client` model's subscription fields.
- **Q4. Teams.** Are multi-user client accounts (invitations, seats, `account/users`) staying?
- **Q5. Entity photos.** If RIP uploads corporate logos to its own Blob store and writes `imageUrl`, this app
  only needs to display them (the store would need to be public or the URLs proxied). If this app should
  host them, we keep one admin-only upload route writing to `entity-photos/`. Which one?
- **Q6. Feed name.** What should the renamed CI feed be called? It affects route, sidebar, metadata, emails.
- **Q7. SMS.** Does the feed include SMS as well as email for corporate entities, as it does today?
- **Q8. Follow digest email.** Keep `digest-following` (daily email of followed entities) and the weekly
  and product-update toggles on the settings page, or remove them?
- **Q9. Share links and OG images.** Keep `/share/[token]` and generated OG screenshots, or drop them
  (which also removes the Chromium dependencies)?
- **Q10. Lookup, Digest, News, `insights`, `ci-entities` (client page).** These were identified by name and
  route only, not read in full. Confirm whether each is kept, parked or stripped.
- **Q11. Public directory.** Should the directory stay public (indexable, good for SEO) with only the feed
  gated, as RIP does?

## 11. Things not fully verified

This was a structural read, not a line-by-line audit. Items classified from file names, route names or
grep counts rather than a full read:

- `app/[clientSlug]/insights`, `app/[clientSlug]/ci-entities`, `app/lookup/*`, `app/digest/*`, `app/news/*`
- Whether `@vercel/connect`, `nodemailer` and `ws` / `bufferutil` / `utf-8-validate` are used by code that
  survives
- Whether `next.config` restricts remote image hosts (affects entity photos)
- The exact set of places that read `CiEntity.type` (about 40 files reference entity type strings; the
  full list should be generated with a grep at the start of Phase 1)
- Every consumer of `Client.subscriptionPlan`, which is referenced from many pages

Re-run the greps in `Phase 6` before declaring the strip complete.
