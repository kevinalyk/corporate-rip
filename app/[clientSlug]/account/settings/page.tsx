"use client"

import { PageHeader } from "@/components/page-header"
import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Loader2, Mail } from "lucide-react"
import { toast } from "sonner"
import AppLayout from "@/components/app-layout"

export default function AccountSettingsPage() {
  const router = useRouter()
  const params = useParams()
  const clientSlug = params.clientSlug as string
  const isAdminRoute = clientSlug === "admin"

  const [loading, setLoading] = useState(true)
  const [productUpdateEnabled, setProductUpdateEnabled] = useState(true)
  const [savingProductUpdate, setSavingProductUpdate] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" })

      if (!response.ok) {
        router.push("/login")
        return
      }

      const userData = await response.json()

      if (userData.firstLogin) {
        router.push("/reset-password")
        return
      }

      if (!isAdminRoute) {
        const verifyResponse = await fetch(`/api/client/verify-access?clientSlug=${clientSlug}`, {
          credentials: "include",
        })

        if (!verifyResponse.ok) {
          if (userData.role === "super_admin") {
            router.push("/rip/ci/campaigns")
          } else if (userData.clientSlug) {
            router.push(`/${userData.clientSlug}`)
          } else {
            router.push("/login")
          }
          return
        }
      } else {
        if (userData.role !== "super_admin") {
          if (userData.clientSlug) {
            router.push(`/${userData.clientSlug}`)
          } else {
            router.push("/login")
          }
          return
        }
      }

      await fetchUserSettings()
    } catch (error) {
      console.error("Auth check failed:", error)
      router.push("/login")
    }
  }

  const fetchUserSettings = async () => {
    try {
      const response = await fetch("/api/user/settings", { credentials: "include" })

      if (response.ok) {
        const data = await response.json()
        setProductUpdateEnabled(data.productUpdateEnabled ?? true)
      }
    } catch (error) {
      console.error("Error fetching user settings:", error)
      toast.error("Failed to load settings")
    } finally {
      setLoading(false)
    }
  }

  const handleProductUpdateToggle = async (enabled: boolean) => {
    setProductUpdateEnabled(enabled)
    setSavingProductUpdate(true)
    try {
      const response = await fetch("/api/user/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productUpdateEnabled: enabled }),
        credentials: "include",
      })
      if (!response.ok) throw new Error("Failed to save")
      toast.success(enabled ? "Product updates enabled" : "Product updates disabled")
    } catch (error) {
      console.error("Error saving product update setting:", error)
      setProductUpdateEnabled(!enabled)
      toast.error("Failed to save setting")
    } finally {
      setSavingProductUpdate(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <Loader2 size={32} className="animate-spin mx-auto mb-4 text-brand-primary" />
          <p>Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <AppLayout clientSlug={clientSlug} isAdminView={isAdminRoute}>
      <div className="mx-auto max-w-4xl">
        <div className="space-y-6">
          <PageHeader
            title="Settings"
            description="Manage your personal preferences and notification settings."
            className="mb-0"
          />

          <Card>
            <CardHeader>
              <CardTitle>Email Notifications</CardTitle>
              <CardDescription>
                Control which emails you receive from brandinbox.ai.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-0">
              <div className="flex items-center justify-between py-4">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <Label htmlFor="product-update-toggle" className="text-sm font-medium cursor-pointer">
                      Product Updates
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Receive a weekly newsletter with the latest features and improvements to brandinbox.ai, sent every Thursday.
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-6 shrink-0">
                  {savingProductUpdate && (
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  )}
                  <Switch
                    id="product-update-toggle"
                    checked={productUpdateEnabled}
                    onCheckedChange={handleProductUpdateToggle}
                    disabled={savingProductUpdate}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  )
}
