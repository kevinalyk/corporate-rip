# RIP + Brand: Shared Database Design

Status: analysis and recommendation. Nothing in this document has been applied to the database yet.
Written from a read of `prisma/schema.prisma` (1,526 lines, ~70 models), the live Neon table list, and
how the app uses each table.

## 1. The question

Both products run on one Neon database. The proposal on the table: share almost every table, and add a
column saying whether a row belongs to RIP or Brand. The alternative: separate everything and share only
the data that gets displayed.

## 2. Recommendation (short version)

Share nearly everything, but do not add a `product` column to nearly everything. Almost every table
already hangs off `clientId`, so one column on `Client` marks every row beneath it.

1. Add `Client.product` (`"rip"` | `"brand"`, default `"rip"`). This is the main discriminator.
2. Do NOT add a product column to `CompetitiveInsightCampaign` or `SmsQueue`. Those rows are one stream
   of captured messages. Brand's slice is already defined by `CiEntity.isCorporate`. A second flag on the
   message would drift from the entity.
3. Keep `BrandUser` as its own table, but make it a structural twin of `User` (same column names and
   semantics) with a real FK to `Client`. This is the one decision for you to confirm (section 6).
4. Where a shared feature needs a user FK, use a Brand twin table (`BrandEntitySubscription` is the
   pattern). Keep the number of twins small and list them in section 5.
5. Add a `product` column only to the few tables that have no `clientId` and are product-specific:
   `TrialCode`, `Announcement`, `Changelog`, `DigestArticle`, `SiteVisit`, `EmailClickEvent`.

Why not fully separate: Client, Stripe billing, Slack, support, domains, API keys and MCP are all
client-scoped and identical in behavior. Duplicating them means writing and maintaining every one of
those features twice.

Why not "one column on every table": it is more migrations and more places to forget a filter, for
no gain, because `clientId` already carries the answer.

## 3. What the data looks like today (live DB)

| Item | Count |
| --- | --- |
| `Client` rows | 55 |
| `User` rows | 109 |
| `BrandUser` rows | 1 (has a `clientId`) |
| `CiEntity` where `isCorporate = true` | 44 (31 `media`, 13 `retail`) |
| `CiEntity` where `isCorporate = false` | 1,661 |
| Email campaigns on corporate entities | 244 (all `source = seed`, no `clientId`) |
| Email campaigns with no entity | 392 |
| SMS on corporate entities | 4 (1 seed, 3 `source = personal` with a `clientId`) |
| SMS with no entity | 1,515 |

Tables in the live DB that are not modeled in `prisma/schema.prisma` (created and queried with raw SQL):
`SupportTicket`, `PasswordResetToken`, `UserInvitation`, and the view `SeedEmailAssignmentView`.
You mentioned `SupportTicket` and `PasswordReset`; they do exist in the database, just not in Prisma.
That is why they did not show up in the schema read. See section 7.

## 4. Why `Client.product` is enough for most tables

These all have a `clientId`, so their product is `JOIN Client` away. They need no new column:

`SlackIntegration`, `SlackChannel`, `SlackEntityFilter`, `ClientDomain` (and its health tables),
`SpamTest`, `ApiKey`, `ClientMcpTermsAcceptance`, `ClientMcpUsageLog`, `EntityTag`, `CiView`,
`CiEntitySubscription`, `PersonalEmailDomain`, `PersonalPhoneNumber`, `TrialCodeRedemption`,
`ClientJoinInvitation`, `SubscriptionCancellationFeedback`, `SupportTicket`, `CampaignAlertSubscription`.

Constraints that already work because `Client` is shared and globally unique:

- `Client.slug` and `Client.name` are unique across both products, so `/[clientSlug]` routing is safe.
- `SlackIntegration.clientId` is unique. One Slack workspace per client, whichever product.
- Stripe IDs on `Client` are unique, so billing and the Stripe webhook keep working unchanged.

Limit of the single column: a client belongs to exactly one product. A company wanting both RIP and
Brand would need two `Client` rows (different `name` and `slug`). If that becomes common, replace
the column with a `ClientProduct` join table later. It is a small change from where we start.

## 5. Table-by-table decisions

Legend: SHARE = one table, no change. CLIENT = scoped through `Client.product`. COLUMN = add `product`.
TWIN = Brand-specific twin because of a `User` FK. RIP-ONLY = Brand never touches it.

### Accounts and tenancy

| Table | Decision | Notes |
| --- | --- | --- |
| `Client` | COLUMN `product` | The discriminator. Brand clients get `product = "brand"`. |
| `User` | RIP-ONLY | RIP team and RIP client users. Unchanged. |
| `BrandUser` | Own table, twin of `User` | FK to `Client` already exists. Keep the same role vocabulary. |
| `UserDomainAccess`, `Domain`, `Campaign`, `Result`, `EmailContent` | RIP-ONLY | Legacy deliverability tracker. |
| `ClientJoinInvitation` | TWIN (later) | FKs `User` twice. Brand invitations need a Brand version or a polymorphic ID. |
| `UserInvitation` (raw) | TWIN (later) | FK to `User`. Same issue. |
| `PasswordResetToken` (raw) | TWIN, needed soon | FK to `User.id`. Brand has no reset flow yet. A Brand version keyed to `BrandUser.id`. |
| `TrialCode`, `TrialCodeRedemption` | COLUMN on `TrialCode` | Redemption follows through `Client`. |
| `SubscriptionCancellationFeedback` | CLIENT | |
| `SupportTicket` (raw) | CLIENT | Has `clientId`, `userId` as plain text with no FK, so it already works for both user tables. |

### Captured data (RIP writes, Brand reads)

| Table | Decision | Notes |
| --- | --- | --- |
| `CiEntity`, `CiEntityMapping` | SHARE | `isCorporate` is the product flag. Already in place. |
| `CompetitiveInsightCampaign`, `CIEmailCompliance` | SHARE | Scope through `entity.isCorporate`. No column. |
| `SmsQueue` | SHARE | Same. |
| `EmailQueue`, `CtaCategory`, `RedactedName`, `CronJobState` | SHARE | Ingestion plumbing. Brand never reads it. |
| `DkimSenderMapping`, `DkimProviderMapping`, `UnsubDomainMapping`, `IpSenderMapping`, `PhoneCarrierMapping` | SHARE | Lookup tables. Product-neutral. |
| `CampaignLaunch` | RIP-ONLY | FEC political launches. |
| `Setting` | SHARE | Prefix keys (`brand.` vs none) if Brand ever needs its own. |

### Per-user and per-client features

| Table | Decision | Notes |
| --- | --- | --- |
| `CiEntitySubscription` | SHARE for RIP | Brand uses `BrandEntitySubscription` (TWIN, exists). |
| `CiView` | TWIN if Brand wants saved views | `createdBy` FK to `User`. |
| `EntityTag` | TWIN if Brand wants tags | `createdBy` FK to `User`. |
| `CampaignAlertSubscription` | TWIN if Brand wants alerts | `userId` FK to `User`. |
| `SlackIntegration`, `SlackChannel`, `Slack*Filter` | CLIENT | `connectedByUserId` is nullable and `SetNull`; Brand can leave it null or add a `connectedByBrandUserId`. Filter columns (`partyFilter`, `stateFilter`) are political and simply default to "all". |
| `ApiKey`, `ClientMcp*` | CLIENT | Parked for Brand at launch. |
| `Mobile*` (4 tables) | RIP-ONLY | FK to `User`. Only revisit if Brand gets a mobile app. |
| `LookupSearch`, `UserCiView`-style personal tables | RIP-ONLY | |
| `Announcement`, `Changelog`, `DigestArticle` | COLUMN `product` | RIP editorial. Brand needs its own audience. |
| `SiteVisit`, `EmailClickEvent` | COLUMN `product` | So analytics can be split by site. |
| `BlockedIp`, `BlockedDomain` | SHARE | A banned IP is banned everywhere. |

### RIP operations (Brand never touches these)

`SeedEmail`, `SeedEmailAssignmentView`, `EngagementLog`, `SenderFamiliarity`, `WinRedInboxMessage`,
`DomainHealthEmailSample`, `DomainHealthDnsResult`, `AutoReplyTemplate`, `SpamTest`, `CiApiActionLog`,
`AutomationSetting`, `MobileAuthAttempt`. No change.

## 6. The decision to confirm: separate `User` tables vs one

You said a separate user table is fine. My recommendation is to keep it separate. Here is the trade-off
so you can overrule it.

Keep `BrandUser` separate (recommended):
- RIP stays untouched. About 63 files call `prisma.user`, including crons that email every user
  (weekly digest, product update, digest-following). With a separate table, none of those can ever email
  or act on a Brand user. Zero regression risk for the live product.
- A Brand session can never be mistaken for a RIP session at the database level.
- Cost: every table with a required `userId` FK to `User` needs a Brand twin if Brand uses that feature.
  Realistically that is `PasswordResetToken`, an invitation table, and optionally saved views, tags and
  alerts. `BrandEntitySubscription` already exists for this reason.

Merge into one `User` with a `product` column:
- No twin tables ever. Every user-scoped feature is shared automatically.
- Cost: `email` can no longer be globally unique (it becomes unique per product), so every
  `findUnique({ where: { email } })` in login, signup, forgot-password and invitations must change. All
  ~63 `prisma.user` callers, and every cron that iterates users, must filter `product = "rip"`. One miss
  emails the wrong audience. That work lands in the RIP repo, and a mistake there affects paying users.

If twin tables start to feel like a tax, the merge is still available later, because `BrandUser` has one
row. It is cheap now and gets harder as RIP-side code grows.

## 7. Risks and things to watch

1. **Personal messages on corporate entities.** 3 SMS are `source = personal` with a `clientId`, assigned
   to corporate entities. They belong to a specific RIP client's private inbox. Brand's feed must either
   exclude `source = personal` or only include rows whose `clientId` matches the viewer's client. The
   mobile feed documents an `entityId IS NOT NULL` rule with no client branch, but the web feed path has
   not been audited against this. Worth a targeted check before launch.
2. **Unassigned messages.** 392 emails and 1,515 SMS have no entity. Brand must keep excluding them,
   since we cannot tell if they are corporate.
3. **Schema drift.** `SupportTicket`, `PasswordResetToken`, `UserInvitation` and
   `SeedEmailAssignmentView` exist only via raw SQL. If either repo ever runs `prisma migrate dev`, it
   may try to reconcile or drop them. Keep them out of Prisma, or model them deliberately on both sides at
   the same time. The earlier migration history mismatch (a DB migration this repo lacks) is the same
   class of problem.
4. **RIP queries that list clients.** Admin "all clients", billing, and crons iterate `Client`. After
   adding `Client.product`, RIP queries that do not filter by it will see Brand clients. For a super admin
   this may be desirable. For crons that email or bill clients, they need `product = "rip"`. Audit
   `app/api/admin/all-clients`, `expire-trials`, and anything seat- or plan-based on the RIP side.
5. **Shared secrets.** Brand sessions use `JWT_SECRET` with an `aud` claim (`brandinbox`). That keeps tokens
   from crossing over. Fine, but it only holds while every RIP verifier checks the audience.

## 8. Suggested migration order

When you approve the design, in this order (all additive, safe to run on the shared DB):

1. `Client.product` text NOT NULL default `'rip'`, plus index. Existing rows stay RIP automatically.
2. Set the Brand user's client to `product = 'brand'`.
3. Add `product` to `TrialCode`, `Announcement`, `Changelog`, `DigestArticle`, `SiteVisit`,
   `EmailClickEvent` (default `'rip'`).
4. Brand twin of `PasswordResetToken` so Brand can ship forgot/reset password.
5. Audit and scope the Brand feed for personal-source messages (risk 1).
6. RIP side: add `product = 'rip'` to client-iterating crons and admin lists (risk 4).

## 9. Files to port to the RIP repo when this is applied

- `prisma/schema.prisma` (copy over by hand; migrations are applied once, from this repo, against the
  shared database)
- RIP-side code that needs filtering for risk 4 lives only in the RIP repo and must be changed there.
