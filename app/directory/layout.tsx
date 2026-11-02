import type { Metadata } from "next"

const TITLE = "Directory - brandinbox.ai"
const DESCRIPTION =
  "Search and explore political candidates, PACs, and organizations tracked by the brandinbox.ai. Browse campaign emails, fundraising texts, and political messaging across the United States."

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "brandinbox.ai",
    type: "website",
    url: "https://brandinbox.ai/directory",
    images: [
      {
        url: "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-NfWjmrBARpThJtdxGKQnSXfC9a1fps.png",
        width: 1200,
        height: 630,
        alt: TITLE,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: ["https://hebbkx1anhila5yf.public.blob.vercel-storage.com/image-NfWjmrBARpThJtdxGKQnSXfC9a1fps.png"],
  },
}

export default function DirectoryLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>
}
