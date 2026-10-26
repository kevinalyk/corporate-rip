// Display text for the client MCP Terms of Use. The accepted version is
// tracked by CLIENT_MCP_TERMS_VERSION in lib/client-mcp.ts - bump it whenever
// this text changes so every client must re-accept.
export const CLIENT_MCP_TERMS_SECTIONS: { heading: string; body: string }[] = [
  {
    heading: "What you can do",
    body: "You may use the RIP MCP to search and read competitive-intelligence emails, text messages and entity information for your own projects, research, analysis, reporting and message inspiration. You may keep excerpts, quotes, screenshots and summaries that you need for that work.",
  },
  {
    heading: "What you may not do",
    body: "You may not scrape, bulk-export, systematically sweep date ranges or entities, or otherwise build a copy or database of RIP data. You may not store, resell, sublicense, republish or redistribute RIP data, or use it to build or train a competing product, dataset or AI model. You may not share your key or use multiple keys to avoid limits.",
  },
  {
    heading: "Limits and monitoring",
    body: "Access is read-only and subject to rate limits and monthly result quotas. We log every request (the key, the query and the message IDs returned) and may suspend or revoke access, without notice, if usage looks like bulk extraction.",
  },
  {
    heading: "Eligibility",
    body: "MCP access is available only on active Professional and Enterprise plans and is not available during a free trial. Access stops automatically if your plan changes or your subscription lapses.",
  },
  {
    heading: "Keys and your responsibility",
    body: "Keep your key secret. You are responsible for all activity under your keys, including anything your AI assistant or vendor does with the data returned. Revoke any key you believe is exposed.",
  },
]
