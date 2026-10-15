/**
 * Tracking pixel helpers (domain health only).
 *
 * Marking a message as read in a mailbox never makes an HTTP request, so a sender's open
 * tracking never fires. A real client fires it by rendering the HTML and loading its remote
 * images. These helpers decode the raw message, find the tracking pixel(s) and request them.
 */

import { simpleParser } from "mailparser"
import * as cheerio from "cheerio"

export interface PixelResult {
  url: string
  statusCode: number
  success: boolean
  error?: string
}

const MAX_PIXELS_PER_EMAIL = 5
const PIXEL_TIMEOUT_MS = 10000

const TRACKING_URL_PATTERN = /(open|pixel|track|beacon|impression|\/o\/)/i

const BROWSER_USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15",
]

/**
 * Decodes a raw RFC822 message (quoted-printable, base64, multipart) into usable html/text.
 */
export async function decodeRawEmail(source: Buffer | string): Promise<{ html: string; text: string }> {
  const parsed = await simpleParser(source)
  return {
    html: typeof parsed.html === "string" ? parsed.html : "",
    text: parsed.text || "",
  }
}

function isTinyImage(el: cheerio.Cheerio<any>): boolean {
  const tiny = new Set(["0", "1", "0px", "1px"])
  const width = (el.attr("width") || "").trim().toLowerCase()
  const height = (el.attr("height") || "").trim().toLowerCase()
  if (tiny.has(width) || tiny.has(height)) return true

  const style = (el.attr("style") || "").toLowerCase().replace(/\s+/g, "")
  return /(width|height):[01](px)?(;|$)/.test(style) || style.includes("display:none")
}

/**
 * Finds likely open-tracking pixels in decoded HTML: 1x1 / hidden images, or images whose URL
 * looks like a tracker. If nothing matches, falls back to the last remote image, since senders
 * almost always append the pixel at the end of the body.
 */
export function extractTrackingPixelUrls(html: string): string[] {
  if (!html) return []

  const $ = cheerio.load(html)
  const remoteImages: { url: string; tiny: boolean }[] = []

  $("img[src]").each((_, node) => {
    const el = $(node)
    const src = (el.attr("src") || "").trim()
    if (!/^https?:\/\//i.test(src)) return
    remoteImages.push({ url: src, tiny: isTinyImage(el) })
  })

  const candidates = remoteImages.filter((img) => img.tiny || TRACKING_URL_PATTERN.test(img.url)).map((img) => img.url)

  const chosen =
    candidates.length > 0
      ? candidates
      : remoteImages.length > 0
        ? [remoteImages[remoteImages.length - 1].url]
        : []

  return [...new Set(chosen)].slice(0, MAX_PIXELS_PER_EMAIL)
}

async function requestPixel(url: string): Promise<PixelResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PIXEL_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": BROWSER_USER_AGENTS[Math.floor(Math.random() * BROWSER_USER_AGENTS.length)],
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Fetch-Dest": "image",
        "Sec-Fetch-Mode": "no-cors",
        "Sec-Fetch-Site": "cross-site",
      },
    })

    // Drain the body so the sender sees a completed request.
    await response.arrayBuffer().catch(() => undefined)

    return { url, statusCode: response.status, success: response.ok }
  } catch (err: any) {
    return {
      url,
      statusCode: 0,
      success: false,
      error: err?.name === "AbortError" ? "Pixel request timed out" : err?.message || "Pixel request failed",
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Requests each pixel URL like an image load. Never throws.
 */
export async function fireTrackingPixels(urls: string[]): Promise<PixelResult[]> {
  const results: PixelResult[] = []
  for (const url of urls) {
    results.push(await requestPixel(url))
  }
  return results
}

/**
 * Decodes raw message source or takes already-decoded HTML, finds the pixel(s) and requests them.
 */
export async function loadTrackingPixelsFromHtml(html: string): Promise<PixelResult[]> {
  const urls = extractTrackingPixelUrls(html)
  if (urls.length === 0) return []
  return fireTrackingPixels(urls)
}
