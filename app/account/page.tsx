"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import Image from "next/image"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BrandWordmark } from "@/components/brand-wordmark"

type BrandUser = {
  id: string
  email: string
  firstName: string
  lastName: string
  company: string | null
  jobTitle: string | null
  createdAt: string
}

const fetchBrandUser = async (url: string): Promise<BrandUser | null> => {
  const response = await fetch(url, { credentials: "include" })
  if (response.status === 401) return null
  if (!response.ok) throw new Error("Failed to load account")
  const data = await response.json()
  return data.user
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b last:border-b-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-right">{value}</dd>
    </div>
  )
}

export default function AccountPage() {
  const { data: user, error, isLoading } = useSWR("/api/brand/auth/me", fetchBrandUser, {
    revalidateOnFocus: false,
  })
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    if (user === null) {
      window.location.href = "/login"
    }
  }, [user])

  const handleSignOut = async () => {
    setSigningOut(true)
    await fetch("/api/brand/auth/logout", { method: "POST", credentials: "include" })
    window.location.href = "/login"
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="text-center mb-8">
        <div className="relative w-32 h-32 mx-auto mb-4">
          <Image
            src="/images/IconOnly_Transparent_NoBuffer.png"
            alt="brandinbox.ai"
            fill
            style={{ objectFit: "contain" }}
            priority
          />
        </div>
        <h1 className="text-4xl">
          <BrandWordmark />
        </h1>
      </div>

      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">
            {user ? `Welcome, ${user.firstName}` : "Your account"}
          </CardTitle>
          <CardDescription>
            {error ? "We couldn't load your account. Please refresh." : "Thanks for signing up to brandinbox.ai."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading || !user ? (
            <div className="flex justify-center py-6" role="status" aria-label="Loading account">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-primary" />
            </div>
          ) : (
            <dl>
              <Detail label="Name" value={`${user.firstName} ${user.lastName}`} />
              <Detail label="Email" value={user.email} />
              {user.company && <Detail label="Company" value={user.company} />}
              {user.jobTitle && <Detail label="Job title" value={user.jobTitle} />}
              <Detail
                label="Member since"
                value={new Date(user.createdAt).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              />
            </dl>
          )}

          <div className="flex flex-col gap-2">
            <Button asChild variant="branded" className="w-full">
              <Link href="/directory">Browse the directory</Link>
            </Button>
            <Button variant="outline" className="w-full" onClick={handleSignOut} disabled={signingOut || !user}>
              {signingOut ? "Signing out..." : "Sign out"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
