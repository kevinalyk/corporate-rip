/**
 * Link Click Simulator
 *
 * Fetches the full body of emails received by domain-health seed accounts,
 * extracts links, filters out junk/system URLs, and makes realistic HTTP GET
 * requests to simulate a human clicking through campaign emails.
 *
 * Only runs against domain-health seeds (domainHealthMode = true).
 * RIP-locked seeds are explicitly excluded.
 */

import { neon } from "@neondatabase/serverless"
import { getServerSettings } from "./email-connection"
import { shouldUseGraphAPI, moveOutlookMessageToInbox } from "./microsoft-graph"
import { getValidAccessToken } from "./microsoft-oauth"
import { decrypt } from "./encryption"
import * as Imap from "node-imap"
import * as cheerio from "cheerio"
import { simpleParser } from "mailparser"
import { createHash } from "crypto"

const sql = neon(process.env.DATABASE_URL!)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DomainHealthSeedAccount {
  id: string
  email: string
  provider: string
  password: string
  appPassword?: string
  twoFactorEnabled: boolean
  personalityType: string
  clickRateTarget: number // 0-100 integer (mirrors open_rate_target pattern)
  readingSchedule: string
  lastClickAt: Date | null
}

interface EmailWithBody {
  subject: string
  sender: string
  receivedAt: Date
  messageId: string
  uid?: number
  graphId?: string
  htmlBody?: string
  textBody?: string
}

// ---------------------------------------------------------------------------
// Personality click-rate configs
// Heavier readers click more; light readers almost never click.
// ---------------------------------------------------------------------------

const PERSONALITY_CLICK_CONFIGS: Record<string, { baseClickRate: number }> = {
  heavy_reader: { baseClickRate: 0.45 },
  moderate: { baseClickRate: 0.25 },
  light_reader: { baseClickRate: 0.1 },
  selective: { baseClickRate: 0.2 },
}

const MAX_MESSAGE_BYTES = 1_500_000
const MAX_EMAILS_PER_FOLDER = 6
const MAX_EMAILS_CLICKED_PER_ACCOUNT = 3
const RUN_BUDGET_MS = 240_000

// ---------------------------------------------------------------------------
// URL filtering helpers
// ---------------------------------------------------------------------------

const SKIP_URL_PATTERNS = [
  /^mailto:/i,
  /^tel:/i,
  /^javascript:/i,
  /^#/,
  /unsub/i,
  /opt.?out/i,
  /remove.?me/i,
  /unsubscribe/i,
  /list.?manage/i,
  /preferences/i,
  /email.?preference/i,
  /manage.?subscription/i,
  /privacy.?policy/i,
  /terms.?of.?service/i,
  /^https?:\/\/[^/]*\.(png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|css|js)(\?|$)/i,
]

const PREFERRED_URL_PATTERNS = [
  /donate/i,
  /contribute/i,
  /chip.?in/i,
  /give/i,
  /support/i,
  /learn.?more/i,
  /read.?more/i,
  /view.?online/i,
  /see.?more/i,
  /take.?action/i,
  /sign.?up/i,
  /register/i,
  /actblue/i,
  /winred/i,
  /anedot/i,
]

/**
 * Returns true if this URL should be skipped entirely (system/unsubscribe/asset links).
 */
function shouldSkipUrl(url: string): boolean {
  try {
    // Must be http or https
    if (!url.startsWith("http://") && !url.startsWith("https://")) return true
    return SKIP_URL_PATTERNS.some((pattern) => pattern.test(url))
  } catch {
    return true
  }
}

/**
 * Scores a URL 0-10 for how "click-worthy" it looks.
 * Higher score = prefer this link.
 */
function scoreUrl(url: string): number {
  let score = 1
  for (const pattern of PREFERRED_URL_PATTERNS) {
    if (pattern.test(url)) score += 2
  }
  return score
}

/**
 * From a list of hrefs extracted from an email body, pick 1-2 realistic links to click.
 */
function selectLinksToClick(hrefs: string[]): string[] {
  const candidates = hrefs.filter((href) => !shouldSkipUrl(href))

  if (candidates.length === 0) return []

  // De-duplicate by URL
  const unique = [...new Set(candidates)]

  // Sort by preference score descending, then shuffle within same score bands
  const scored = unique.map((url) => ({ url, score: scoreUrl(url) }))
  scored.sort((a, b) => b.score - a.score)

  // Pick top 1-2, with slight randomness
  const maxClicks = Math.random() < 0.35 ? 2 : 1
  return scored.slice(0, maxClicks).map((s) => s.url)
}

/**
 * Extracts all href values from an HTML email body using cheerio.
 * Falls back to a regex scan of plain-text bodies.
 */
function extractLinksFromBody(htmlBody?: string, textBody?: string): string[] {
  const hrefs: string[] = []

  if (htmlBody) {
    try {
      const $ = cheerio.load(htmlBody)
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href")
        if (href) hrefs.push(href.trim())
      })
    } catch {
      // fall through to text scan
    }
  }

  if (hrefs.length === 0 && textBody) {
    // Plain-text fallback: pull bare https:// URLs
    const matches = textBody.match(/https?:\/\/[^\s<>"]+/g) || []
    hrefs.push(...matches)
  }

  return hrefs
}

// ---------------------------------------------------------------------------
// HTTP click execution
// ---------------------------------------------------------------------------

const BROWSER_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

function randomUserAgent(): string {
  return BROWSER_USER_AGENTS[Math.floor(Math.random() * BROWSER_USER_AGENTS.length)]
}

async function fetchAsBrowser(url: string, redirect: "manual" | "follow", timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "User-Agent": randomUserAgent(),
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        Connection: "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
      },
      redirect,
    })
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Simulates a click on an ESP tracking link.
 *
 * The ESP registers the click when its tracker receives the request, so success is scored on that
 * first hop. The redirect is not auto-followed; the destination is then requested best-effort, and
 * a bot-blocked destination (e.g. a WinRed 403) does not turn a delivered click into a failure.
 */
async function performClick(
  url: string,
): Promise<{ success: boolean; finalUrl: string; statusCode: number; note?: string }> {
  let tracker: Response
  try {
    tracker = await fetchAsBrowser(url, "manual", 15000)
  } catch (err: any) {
    const reason = err?.name === "AbortError" ? "tracker request timed out" : "tracker request failed"
    console.log(`  ${reason}: ${url}`)
    return { success: false, finalUrl: url, statusCode: 0, note: reason }
  }

  const trackerStatus = tracker.status
  const location = tracker.headers.get("location")
  await tracker.body?.cancel().catch(() => {})

  if (trackerStatus >= 400) {
    return { success: false, finalUrl: url, statusCode: trackerStatus, note: `tracker returned ${trackerStatus}` }
  }

  const isRedirect = trackerStatus >= 300 && trackerStatus < 400 && !!location
  if (!isRedirect) {
    return { success: true, finalUrl: url, statusCode: trackerStatus }
  }

  let destination = url
  try {
    destination = new URL(location, url).toString()
    const response = await fetchAsBrowser(destination, "follow", 10000)
    await response.body?.cancel().catch(() => {})
    return {
      success: true,
      finalUrl: response.url || destination,
      statusCode: response.status,
      note: response.status >= 400 ? `tracker hop ok (${trackerStatus}); destination returned ${response.status}` : undefined,
    }
  } catch {
    return {
      success: true,
      finalUrl: destination,
      statusCode: trackerStatus,
      note: `tracker hop ok (${trackerStatus}); destination request failed`,
    }
  }
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

async function logClickEngagement(
  seedEmailId: string,
  email: EmailWithBody,
  clickedUrl: string,
  success: boolean,
  errorMessage?: string,
): Promise<void> {
  await sql`
    INSERT INTO "EngagementLog" (
      "seedEmailId",
      "action",
      "emailSubject",
      "emailSender",
      "emailReceivedAt",
      "success",
      "errorMessage",
      "clickedUrl"
    ) VALUES (
      ${seedEmailId},
      'click',
      ${email.subject},
      ${email.sender},
      ${email.receivedAt.toISOString()},
      ${success},
      ${errorMessage || null},
      ${clickedUrl}
    )
  `
}

async function updateLastClickAt(seedEmailId: string): Promise<void> {
  await sql`
    UPDATE "SeedEmail"
    SET "last_click_at" = CURRENT_TIMESTAMP
    WHERE id = ${seedEmailId}
  `
}

async function updateSenderFamiliarity(seedEmailId: string, senderEmail: string): Promise<void> {
  await sql`
    INSERT INTO "SenderFamiliarity" ("seedEmailId", "senderEmail", "engagementCount", "lastEngagementAt", "trustScore")
    VALUES (${seedEmailId}, ${senderEmail}, 1, CURRENT_TIMESTAMP, 0.6)
    ON CONFLICT ("seedEmailId", "senderEmail")
    DO UPDATE SET
      "engagementCount" = "SenderFamiliarity"."engagementCount" + 1,
      "lastEngagementAt" = CURRENT_TIMESTAMP,
      "trustScore" = LEAST(1.0, "SenderFamiliarity"."trustScore" + 0.1)
  `
}

// ---------------------------------------------------------------------------
// Account query
// ---------------------------------------------------------------------------

async function getDomainHealthAccounts(): Promise<DomainHealthSeedAccount[]> {
  console.log("Fetching domain health seed accounts for link clicking...")

  const accounts = await sql`
    SELECT
      id,
      email,
      provider,
      password,
      "appPassword",
      "twoFactorEnabled",
      "personality_type"    AS "personalityType",
      "click_rate_target"   AS "clickRateTarget",
      "reading_schedule"    AS "readingSchedule",
      "last_click_at"       AS "lastClickAt"
    FROM "SeedEmail"
    WHERE "domainHealthMode" = true
    AND email IS NOT NULL
    AND password IS NOT NULL
    AND locked = 'true'
    AND "engagement_enabled" = true
    AND active = true
  `

  console.log(`Found ${accounts.length} domain health accounts`)

  return accounts.map((a) => ({
    id: a.id,
    email: a.email,
    provider: a.provider,
    password: a.password,
    appPassword: a.appPassword,
    twoFactorEnabled: a.twoFactorEnabled === "true" || a.twoFactorEnabled === true,
    personalityType: a.personalityType || "moderate",
    clickRateTarget: typeof a.clickRateTarget === "number" ? a.clickRateTarget : Number(a.clickRateTarget ?? 0),
    readingSchedule: a.readingSchedule || "business_hours",
    lastClickAt: a.lastClickAt ? new Date(a.lastClickAt) : null,
  }))
}

// ---------------------------------------------------------------------------
// Per-email click decision
// ---------------------------------------------------------------------------

function getClickRate(account: DomainHealthSeedAccount): number {
  const config = PERSONALITY_CLICK_CONFIGS[account.personalityType] ?? PERSONALITY_CLICK_CONFIGS.moderate
  return account.clickRateTarget > 0 ? account.clickRateTarget / 100 : config.baseClickRate
}

/**
 * Deterministic 0-1 value for a (seed, email) pair, so each email gets one stable
 * click/no-click decision instead of being re-rolled on every cron run.
 */
function stableRoll(seedEmailId: string, emailKey: string): number {
  const digest = createHash("sha256").update(`${seedEmailId}:${emailKey}`).digest()
  return digest.readUInt32BE(0) / 0x100000000
}

function emailKeyOf(email: EmailWithBody): string {
  return `${email.subject}|${email.sender}`
}

async function getClickedEmailKeys(seedEmailId: string): Promise<Set<string>> {
  const rows = await sql`
    SELECT "emailSubject", "emailSender"
    FROM "EngagementLog"
    WHERE "seedEmailId" = ${seedEmailId}
    AND action = 'click'
    AND success = true
    AND "performedAt" > NOW() - INTERVAL '14 days'
  `
  return new Set(rows.map((r) => `${r.emailSubject}|${r.emailSender}`))
}

// ---------------------------------------------------------------------------
// IMAP body fetcher
// ---------------------------------------------------------------------------

async function parseRawMessage(source: Buffer, uid: number): Promise<EmailWithBody | null> {
  try {
    const parsed = await simpleParser(source)
    return {
      subject: parsed.subject || "",
      sender: parsed.from?.value?.[0]?.address || "",
      receivedAt: parsed.date || new Date(),
      messageId: parsed.messageId || "",
      uid,
      htmlBody: typeof parsed.html === "string" ? parsed.html : undefined,
      textBody: parsed.text || undefined,
    }
  } catch (err) {
    console.error(`  Failed to decode message UID ${uid}:`, err)
    return null
  }
}

function fetchImapEmailsWithBody(account: DomainHealthSeedAccount): Promise<EmailWithBody[]> {
  return new Promise((resolve) => {
    try {
      const password =
        account.twoFactorEnabled && account.appPassword
          ? decrypt(account.appPassword)
          : decrypt(account.password)

      const serverSettings = getServerSettings(account.provider)
      if (!serverSettings?.imap) {
        console.log(`  No IMAP settings for provider: ${account.provider}`)
        resolve([])
        return
      }

      const imap = new Imap({
        user: account.email,
        password,
        host: serverSettings.imap.host,
        port: serverSettings.imap.port,
        tls: serverSettings.imap.tls,
        tlsOptions: { rejectUnauthorized: false, servername: serverSettings.imap.host },
        authTimeout: 20000,
        connTimeout: 20000,
      })

      let resolved = false
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          console.log(`  IMAP timeout for ${account.email}`)
          try { imap.end() } catch {}
          resolve([])
        }
      }, 45000)

      imap.once("error", (err) => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          console.error(`  IMAP error for ${account.email}:`, err.message)
          resolve([])
        }
      })

      imap.once("ready", () => {
        console.log(`  IMAP connected for ${account.email}`)
        const foldersToCheck = ["INBOX", "Junk", "Spam", "[Gmail]/Spam"]
        const allEmails: EmailWithBody[] = []

        const checkNextFolder = (idx: number) => {
          if (idx >= foldersToCheck.length) {
            if (!resolved) {
              resolved = true
              clearTimeout(timeout)
              imap.end()
              resolve(allEmails)
            }
            return
          }

          const folder = foldersToCheck[idx]
          imap.openBox(folder, false, (err) => {
            if (err) {
              checkNextFolder(idx + 1)
              return
            }

            const since = new Date(Date.now() - 48 * 60 * 60 * 1000) // last 48h for clicks
            imap.search(["SEEN", ["SINCE", since]], (err, results) => {
              if (err || !results || results.length === 0) {
                checkNextFolder(idx + 1)
                return
              }

              // Most recent few per folder — we only need a handful to click
              const uids = results.slice(-MAX_EMAILS_PER_FOLDER)
              console.log(`  Found ${results.length} recent emails in ${folder}, checking ${uids.length}`)

              // Fetch the full raw message so mailparser can decode quoted-printable / base64 / multipart
              const fetchReq = imap.fetch(uids, { bodies: "" })

              const parsePromises: Promise<void>[] = []

              fetchReq.on("message", (msg) => {
                const chunks: Buffer[] = []
                let uid = 0

                let oversized = false

                msg.on("body", (stream, info) => {
                  if (info?.size > MAX_MESSAGE_BYTES) {
                    oversized = true
                    stream.resume()
                    return
                  }
                  stream.on("data", (chunk: Buffer) => chunks.push(chunk))
                })

                msg.once("attributes", (attrs) => { uid = attrs.uid })

                msg.once("end", () => {
                  if (oversized) {
                    console.log(`  Skipping UID ${uid} in ${folder} — message larger than ${MAX_MESSAGE_BYTES} bytes`)
                    return
                  }
                  const source = Buffer.concat(chunks)
                  parsePromises.push(
                    parseRawMessage(source, uid).then((parsed) => {
                      if (parsed) allEmails.push(parsed)
                    }),
                  )
                })
              })

              fetchReq.once("error", () => checkNextFolder(idx + 1))
              fetchReq.once("end", async () => {
                await Promise.all(parsePromises)

                // Domain health only: move every email we're about to click through from a
                // spam-like folder into the Inbox first, so the click reflects inbox engagement.
                const isSpamLikeFolder = folder.toLowerCase().includes("junk") || folder.toLowerCase().includes("spam")
                if (isSpamLikeFolder && uids.length > 0) {
                  imap.move(uids, "INBOX", (moveErr: any) => {
                    if (moveErr) {
                      console.error(`  Failed to move ${uids.length} email(s) from "${folder}" to Inbox for ${account.email}:`, moveErr)
                    } else {
                      console.log(`  Moved ${uids.length} email(s) from "${folder}" to Inbox for ${account.email}`)
                    }
                    checkNextFolder(idx + 1)
                  })
                } else {
                  checkNextFolder(idx + 1)
                }
              })
            })
          })
        }

        checkNextFolder(0)
      })

      imap.connect()
    } catch (err) {
      console.error(`  IMAP setup error for ${account.email}:`, err)
      resolve([])
    }
  })
}

// ---------------------------------------------------------------------------
// Outlook (Graph API) body fetcher
// ---------------------------------------------------------------------------

async function fetchOutlookEmailsWithBody(account: DomainHealthSeedAccount): Promise<EmailWithBody[]> {
  try {
    const accessToken = await getValidAccessToken(account.id)
    if (!accessToken) {
      console.log(`  No access token for ${account.email}`)
      return []
    }

    const since = new Date(Date.now() - 48 * 60 * 60 * 1000)
    const allEmails: EmailWithBody[] = []

    for (const folder of ["inbox", "junkemail"]) {
      // Fetch with body content included
      const url =
        `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages` +
        `?$filter=isRead eq true and receivedDateTime ge ${since.toISOString()}` +
        `&$select=id,subject,from,receivedDateTime,internetMessageId,body` +
        `&$top=10`

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      })

      if (!response.ok) continue

      const data = await response.json()
      const messages = data.value || []

      // Domain health only: move every email we're about to click through from Junk Email
      // into the Inbox first, so the click reflects inbox engagement.
      if (folder === "junkemail" && messages.length > 0) {
        for (const msg of messages) {
          const moved = await moveOutlookMessageToInbox(account.id, msg.id)
          if (moved) {
            console.log(`  Moved email "${msg.subject}" from Junk Email to Inbox for ${account.email}`)
          }
        }
      }

      for (const msg of messages) {
        allEmails.push({
          subject: msg.subject || "",
          sender: msg.from?.emailAddress?.address || "",
          receivedAt: new Date(msg.receivedDateTime),
          messageId: msg.internetMessageId || msg.id,
          graphId: msg.id,
          htmlBody: msg.body?.contentType === "html" ? msg.body.content : undefined,
          textBody: msg.body?.contentType === "text" ? msg.body.content : undefined,
        })
      }
    }

    console.log(`  Graph API returned ${allEmails.length} recent emails for ${account.email}`)
    return allEmails
  } catch (err) {
    console.error(`  Error fetching Outlook emails for ${account.email}:`, err)
    return []
  }
}

// ---------------------------------------------------------------------------
// Per-account processing
// ---------------------------------------------------------------------------

async function processAccountLinkClicks(account: DomainHealthSeedAccount, deadline: number): Promise<void> {
  console.log(`\nProcessing ${account.email} (personality: ${account.personalityType}, clickRate: ${account.clickRateTarget}%)`)

  // Fetch recent emails (already-opened ones — we click after reading)
  let emails: EmailWithBody[] = []
  if (shouldUseGraphAPI(account.provider)) {
    emails = await fetchOutlookEmailsWithBody(account)
  } else {
    emails = await fetchImapEmailsWithBody(account)
  }

  if (emails.length === 0) {
    console.log(`  No emails with body content found for ${account.email}`)
    return
  }

  // Each email gets one stable click decision at the seed's click rate, and is never clicked twice.
  const clickRate = getClickRate(account)
  const alreadyClicked = await getClickedEmailKeys(account.id)
  const eligible = emails
    .filter((e) => !alreadyClicked.has(emailKeyOf(e)) && stableRoll(account.id, emailKeyOf(e)) < clickRate)
    .sort(() => Math.random() - 0.5)

  console.log(
    `  ${eligible.length}/${emails.length} email(s) selected for clicking (rate ${Math.round(clickRate * 100)}%, ${alreadyClicked.size} already clicked)`,
  )

  if (eligible.length === 0) return

  let clicksPerformed = 0
  let emailsClicked = 0

  for (const email of eligible) {
    if (emailsClicked >= MAX_EMAILS_CLICKED_PER_ACCOUNT || Date.now() > deadline) break

    const hrefs = extractLinksFromBody(email.htmlBody, email.textBody)
    const linksToClick = selectLinksToClick(hrefs)

    if (linksToClick.length === 0) {
      console.log(
        `  No clickable links in "${email.subject}" — skipping (${hrefs.length} link(s) found, html: ${email.htmlBody ? "yes" : "no"})`,
      )
      continue
    }

    console.log(`  Clicking ${linksToClick.length} link(s) in "${email.subject}" from ${email.sender}`)
    emailsClicked++

    for (const url of linksToClick) {
      console.log(`    -> ${url}`)

      // Short reading pause before clicking (2-8 seconds)
      await new Promise((r) => setTimeout(r, 2000 + Math.random() * 6000))

      const result = await performClick(url)
      console.log(
        `    Success: ${result.success} | Status: ${result.statusCode} | Final URL: ${result.finalUrl}${result.note ? ` | ${result.note}` : ""}`,
      )

      await logClickEngagement(account.id, email, url, result.success, result.note)
      if (result.success) {
        await updateSenderFamiliarity(account.id, email.sender)
      }

      clicksPerformed++

      // Brief gap between multiple clicks in same session (2-6 seconds)
      if (linksToClick.indexOf(url) < linksToClick.length - 1) {
        await new Promise((r) => setTimeout(r, 2000 + Math.random() * 4000))
      }
    }
  }

  if (clicksPerformed > 0) {
    await updateLastClickAt(account.id)
    console.log(`  Completed ${clicksPerformed} click(s) for ${account.email}`)
  } else {
    console.log(`  No clicks performed for ${account.email} — no suitable links found`)
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function simulateDomainHealthLinkClicks(): Promise<{
  accountsProcessed: number
  accountsClicked: number
  totalClicks: number
}> {
  console.log("Starting domain health link click simulation...")

  const accounts = await getDomainHealthAccounts()

  if (accounts.length === 0) {
    console.log("No domain health accounts found, exiting.")
    return { accountsProcessed: 0, accountsClicked: 0, totalClicks: 0 }
  }

  // Every account is processed each run; shuffled so none is consistently starved if the time budget runs out.
  const activeAccounts = accounts.sort(() => Math.random() - 0.5)
  const deadline = Date.now() + RUN_BUDGET_MS

  console.log(`Processing ${activeAccounts.length} domain health accounts this run`)

  let accountsClicked = 0
  let totalClicks = 0
  let accountsAttempted = 0

  for (const account of activeAccounts) {
    if (Date.now() > deadline) {
      console.log("Run time budget exhausted — remaining accounts will be handled next run")
      break
    }
    accountsAttempted++

    try {
      // Count clicks before processing
      const beforeCount = await sql`
        SELECT COUNT(*) AS cnt FROM "EngagementLog"
        WHERE "seedEmailId" = ${account.id}
        AND action = 'click'
        AND "performedAt" > NOW() - INTERVAL '5 minutes'
      `
      const before = Number(beforeCount[0]?.cnt ?? 0)

      await processAccountLinkClicks(account, deadline)

      const afterCount = await sql`
        SELECT COUNT(*) AS cnt FROM "EngagementLog"
        WHERE "seedEmailId" = ${account.id}
        AND action = 'click'
        AND "performedAt" > NOW() - INTERVAL '5 minutes'
      `
      const after = Number(afterCount[0]?.cnt ?? 0)
      const delta = after - before

      if (delta > 0) {
        accountsClicked++
        totalClicks += delta
      }
    } catch (err) {
      console.error(`Error processing ${account.email}:`, err)
    }

    // Gap between accounts (1-3 seconds)
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000))
  }

  console.log(
    `Link click simulation complete. Processed: ${accountsAttempted}, clicked: ${accountsClicked}, total clicks: ${totalClicks}`,
  )

  return {
    accountsProcessed: accountsAttempted,
    accountsClicked,
    totalClicks,
  }
}

/**
 * Initializes click_rate_target for domain health seeds that have it set to 0.
 * Called once per cron run to onboard new seeds gracefully.
 */
export async function initializeDomainHealthClickRates(): Promise<void> {
  const seeds = await sql`
    SELECT id, "personality_type" AS "personalityType"
    FROM "SeedEmail"
    WHERE "domainHealthMode" = true
    AND "click_rate_target" = 0
    AND active = true
  `

  if (seeds.length === 0) return

  console.log(`Initializing click_rate_target for ${seeds.length} domain health seeds...`)

  for (const seed of seeds) {
    const config = PERSONALITY_CLICK_CONFIGS[seed.personalityType] ?? PERSONALITY_CLICK_CONFIGS.moderate
    // Add ±5% variance around the personality baseline
    const rate = config.baseClickRate + (Math.random() - 0.5) * 0.1
    const target = Math.round(Math.max(5, Math.min(50, rate * 100)))

    await sql`
      UPDATE "SeedEmail"
      SET "click_rate_target" = ${target}
      WHERE id = ${seed.id}
    `
  }

  console.log(`Initialized click rates for ${seeds.length} seeds`)
}
