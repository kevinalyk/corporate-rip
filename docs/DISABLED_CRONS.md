# Disabled crons

All crons in `vercel.json` were disabled (`"crons": []`) because RIP owns all background processing and this app only reads the shared database. This file preserves the original schedule so any cron can be restored deliberately later.

The route handlers under `app/api/cron/*` still exist and can be invoked manually with `CRON_SECRET`. Only the Vercel schedule was removed. Vercel applies cron changes on the next production deployment.

## Original schedule

| Path | Schedule (UTC) |
| --- | --- |
| `/api/cron/detect-competitive-insights?providers=gmail` | `*/10 * * * *` |
| `/api/cron/detect-competitive-insights?providers=yahoo` | `*/10 * * * *` |
| `/api/cron/detect-competitive-insights?providers=outlook,hotmail,live` | `*/10 * * * *` |
| `/api/cron/detect-competitive-insights?providers=aol` | `*/10 * * * *` |
| `/api/cron/detect-campaigns` | `0 4 * * *` |
| `/api/cron/check-all-campaigns` | `*/30 * * * *` |
| `/api/cron/cleanup-old-results` | `0 8 * * *` |
| `/api/cron/simulate-engagement` | `0 */6 * * *` |
| `/api/cron/unwrap-links` | `*/5 * * * *` |
| `/api/cron/auto-assign-unassigned` | `0 6,18 * * *` |
| `/api/cron/redact-names` | `0 */6 * * *` |
| `/api/cron/check-seed-emails` | `0 9 * * *` |
| `/api/cron/engage-rip-seeds` | `0 8,13,19 * * *` |
| `/api/cron/check-email-compliance` | `*/30 * * * *` |
| `/api/cron/purge-old-ci-data` | `0 2 * * *` |
| `/api/cron/resolve-sending-providers` | `0 * * * *` |
| `/api/cron/scrape-fec-launches` | `0 14,22 * * *` |
| `/api/cron/refresh-ballotpedia` | `0 9 * * *` |
| `/api/cron/digest-following` | `0 12 * * *` |
| `/api/cron/weekly-digest` | `0 2 * * 1` |
| `/api/cron/gsc-index` | `0 10 * * *` |
| `/api/cron/product-update` | `0 17 * * 4` |
| `/api/cron/domain-health-scan` | `0 * * * *` |
| `/api/cron/click-domain-health-emails` | `7 10,15,21 * * *` |
| `/api/cron/simulate-domain-health-engagement` | `0 * * * *` |
| `/api/cron/auto-reply-verified-domains` | `15 * * * *` |
| `/api/cron/expire-trials` | `0 7 * * *` |
| `/api/cron/winred-inbox-scan` | `0 11 * * *` |

## Likely candidates to restore later

- `digest-following` (following digests) and `weekly-digest`, if this app sends its own emails.
- `expire-trials`, if corporate has its own trial/billing lifecycle.

Everything else (ingestion, assignment, link unwrapping, FEC/Ballotpedia, seed engagement, domain health) is handled on the RIP side and should stay off here.
