import type { Metadata } from "next"
import { getDirectoryAccess } from "@/lib/directory-access"
import AppLayout from "@/components/app-layout"
import { CiDirectoryContent } from "@/components/ci-directory-content"
import { getAllEntitiesWithCounts } from "@/lib/ci-entity-utils"
import AdBanner from "@/components/ad-banner"
import { shouldShowAd } from "@/lib/ads"

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://brandinbox.ai"

export const metadata: Metadata = {
  title: "Political Campaign Directory - brandinbox.ai",
  description: "Browse campaign emails and texts from thousands of political candidates, PACs, and advocacy groups across the United States. Track political messaging with brandinbox.ai.",
  keywords: [
    "political campaign directory",
    "republican candidates emails",
    "PAC fundraising texts",
    "political messaging database",
    "campaign email tracker",
    "GOP candidate directory",
    "political organization contacts",
    "inbox gop directory",
  ],
  robots: { index: true, follow: true },
  alternates: { canonical: `${APP_URL}/directory` },
  openGraph: {
    title: "Political Campaign Directory - brandinbox.ai",
    description: "Browse campaign emails and texts from thousands of political candidates, PACs, and advocacy groups across the United States.",
    url: `${APP_URL}/directory`,
    siteName: "brandinbox.ai",
    type: "website",
    images: [{ url: `${APP_URL}/og-candidate-directory.png`, width: 1200, height: 630, alt: "brandinbox.ai Political Directory" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Political Campaign Directory - brandinbox.ai",
    description: "Browse campaign emails and texts from thousands of political candidates, PACs, and advocacy groups.",
    images: [`${APP_URL}/og-candidate-directory.png`],
  },
}

export default async function PublicDirectoryPage() {
  // Resolve clientSlug server-side so the page ships with pre-rendered HTML
  // that bots and AI agents can read. Unauthenticated visitors get an empty
  // string, which CiDirectoryContent already handles gracefully.
  const { clientSlug } = await getDirectoryAccess()

  const [showAd, initialResult] = await Promise.all([
    shouldShowAd(),
    getAllEntitiesWithCounts({ page: 1, pageSize: 50 }),
  ])

  return (
    <AppLayout clientSlug={clientSlug} defaultCollapsed={true}>
      <AdBanner showAd={showAd} />
      <CiDirectoryContent
        clientSlug={clientSlug}
        isPublic={!clientSlug}
        initialEntities={initialResult.entities}
        initialPagination={initialResult.pagination}
        syncUrlWithFilters
      />
    </AppLayout>
  )
}
