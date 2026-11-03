"use client"

import type React from "react"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import useSWR from "swr"
import { useTheme } from "next-themes"
import {
  Bot,
  Building,
  Building2,
  ChevronDown,
  Code,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Moon,
  Plug,
  ScanSearch,
  Settings,
  Smartphone,
  Star,
  Sun,
  UserCog,
  Users,
  X,
  BarChart3,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Logo } from "@/components/logo"
import { BrandWordmark } from "@/components/brand-wordmark"
import { TrialStatusBanner } from "@/components/trial-status-banner"
import { useCurrentUser } from "@/lib/hooks/use-current-user"

interface AppLayoutProps {
  children: React.ReactNode
  clientSlug?: string
  isAdminView?: boolean
  /** Kept so existing callers compile; the top navigation has no collapsed state. */
  defaultCollapsed?: boolean
}

interface ClientOption {
  id: string
  name: string
  slug: string
}

interface NavLinkItem {
  label: string
  href: string
  icon: React.ElementType
  active: boolean
}

// First path segments that are not a client slug, so they never overwrite the selected client.
const NON_CLIENT_PATHS = ["news", "login", "share", "directory", "digest", "about", "privacy", "terms", "lookup", "admin"]

// The Developers section is a pilot limited to these clients.
const DEVELOPER_PILOT_SLUGS = ["rip", "redsparkstrategy"]

const jsonFetcher = (url: string) =>
  fetch(url, { credentials: "include" }).then((res) => (res.ok ? res.json() : null))

function AppLayout({ children, clientSlug, isAdminView = false }: AppLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const { user: currentUser, loading: userLoading } = useCurrentUser()
  const [mounted, setMounted] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [lastClientSlug, setLastClientSlug] = useState<string | null>(null)

  const userRole: string | null = currentUser?.role ?? null
  const isSuperAdmin = userRole === "super_admin"
  const isSignedOut = !userLoading && !userRole

  const firstSegment = pathname.split("/").filter(Boolean)[0]
  const pathSlug = firstSegment && !NON_CLIENT_PATHS.includes(firstSegment) ? firstSegment : null

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (pathSlug) setLastClientSlug(pathSlug)
  }, [pathSlug])

  // Close the mobile menu on navigation and on Escape.
  useEffect(() => setMobileOpen(false), [pathname])
  useEffect(() => {
    if (!mobileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [mobileOpen])

  const activeSlug =
    pathSlug ??
    (clientSlug && clientSlug !== "admin" ? clientSlug : null) ??
    lastClientSlug ??
    currentUser?.client?.slug ??
    (isAdminView ? "admin" : "admin")

  const { data: clients } = useSWR<ClientOption[] | null>(isSuperAdmin ? "/api/clients" : null, jsonFetcher, {
    revalidateOnFocus: false,
  })

  const showDevelopers = userRole !== null && DEVELOPER_PILOT_SLUGS.includes(activeSlug)
  const { data: mcpStatus } = useSWR<{ eligible: boolean } | null>(
    showDevelopers ? `/api/client-mcp/status?clientSlug=${activeSlug}` : null,
    jsonFetcher,
    { revalidateOnFocus: false },
  )

  const contentLinks: NavLinkItem[] = [
    {
      label: "Feed",
      href: `/${activeSlug}/ci/campaigns`,
      icon: LayoutDashboard,
      active: pathname.includes("/ci/campaigns"),
    },
    {
      label: "Following",
      href: `/${activeSlug}/ci/subscriptions`,
      icon: Star,
      active: pathname.includes("/ci/subscriptions"),
    },
    {
      label: "Personal Email",
      href: `/${activeSlug}/ci/personal`,
      icon: Mail,
      active: pathname.includes("/ci/personal") && !pathname.includes("/ci/personal-numbers"),
    },
    {
      label: "Personal Numbers",
      href: `/${activeSlug}/ci/personal-numbers`,
      icon: Smartphone,
      active: pathname.includes("/ci/personal-numbers"),
    },
  ]

  const radarLinks: NavLinkItem[] = isSuperAdmin
    ? [
        {
          label: "Directory",
          href: "/directory",
          icon: Building2,
          active: pathname === "/directory" || pathname.startsWith("/directory/"),
        },
      ]
    : []

  const developerLinks: NavLinkItem[] = []
  if (showDevelopers) {
    if (mcpStatus?.eligible) {
      developerLinks.push({
        label: "MCP Access",
        href: `/${activeSlug}/developers/mcp`,
        icon: Bot,
        active: pathname === `/${activeSlug}/developers/mcp`,
      })
    }
    if (isSuperAdmin) {
      developerLinks.push({
        label: "MCP Usage",
        href: `/${activeSlug}/developers/mcp-usage`,
        icon: BarChart3,
        active: pathname === `/${activeSlug}/developers/mcp-usage`,
      })
    }
  }

  const accountLinks: NavLinkItem[] = [
    { label: "Settings", href: `/${activeSlug}/account/settings`, icon: Settings, active: pathname.includes("/account/settings") },
    { label: "Users", href: `/${activeSlug}/account/users`, icon: Users, active: pathname.includes("/account/users") },
    { label: "Billing", href: `/${activeSlug}/account/billing`, icon: CreditCard, active: pathname.includes("/account/billing") },
    { label: "Integrations", href: `/${activeSlug}/account/integrations`, icon: Plug, active: pathname.includes("/account/integrations") },
  ]

  const contentActive = contentLinks.some((l) => l.active)
  const radarActive = radarLinks.some((l) => l.active)
  const accountActive = accountLinks.some((l) => l.active)
  const developersActive = developerLinks.some((l) => l.active)

  const toggleTheme = () => setTheme(theme === "dark" ? "light" : "dark")

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" })
    } catch (error) {
      console.error("Logout error:", error)
    }
    router.push("/login")
  }

  const handleClientSwitch = (newSlug: string) => {
    const parts = pathname.split("/").filter(Boolean)
    if (pathSlug) {
      parts[0] = newSlug
      router.push(`/${parts.join("/")}`)
    } else {
      router.push(`/${newSlug}/ci/campaigns`)
    }
  }

  const clientSwitcher =
    isSuperAdmin && clients && clients.length > 0 ? (
      <Select value={pathSlug ?? activeSlug} onValueChange={handleClientSwitch}>
        <SelectTrigger className="h-9 w-full bg-transparent lg:w-[180px]" aria-label="Switch client">
          <div className="flex min-w-0 items-center gap-2">
            <Building size={14} className="shrink-0 text-brand-secondary" />
            <SelectValue placeholder="Select client" />
          </div>
        </SelectTrigger>
        <SelectContent>
          {clients.map((client) => (
            <SelectItem key={client.id} value={client.slug}>
              {client.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : null

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header
        className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Link
            href={isSignedOut ? "/login" : `/${activeSlug}/ci/campaigns`}
            className="flex shrink-0 items-center gap-2"
            aria-label="brandinbox.ai home"
          >
            <Logo variant="icon" className="[&_img]:h-8 [&_img]:w-8" />
            <BrandWordmark className="text-lg" />
          </Link>

          {!isSignedOut && (
            <nav className="hidden h-full items-stretch gap-1 lg:flex" aria-label="Primary">
              <MenuGroup label="Content" icon={LayoutDashboard} active={contentActive} items={contentLinks} />
              {radarLinks.length > 0 && (
                <MenuGroup label="Radar" icon={ScanSearch} active={radarActive} items={radarLinks} />
              )}
              {developerLinks.length > 0 && (
                <MenuGroup label="Developers" icon={Code} active={developersActive} items={developerLinks} />
              )}
              <MenuGroup
                label="Account"
                icon={UserCog}
                active={accountActive}
                items={accountLinks}
                header={currentUser?.email}
              />
            </nav>
          )}

          <div className="ml-auto flex items-center gap-2">
            {!isSignedOut && <div className="hidden lg:block">{clientSwitcher}</div>}

            {mounted && (
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-9 w-9 lg:inline-flex"
                onClick={toggleTheme}
                aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
              </Button>
            )}

            {isSignedOut ? (
              <Button size="sm" onClick={() => router.push("/login")}>
                Log in
              </Button>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="hidden h-9 w-9 lg:inline-flex"
                  onClick={handleLogout}
                  aria-label="Log out"
                >
                  <LogOut size={18} />
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 lg:hidden"
                  aria-label={mobileOpen ? "Close menu" : "Open menu"}
                  aria-expanded={mobileOpen}
                  onClick={() => setMobileOpen((open) => !open)}
                >
                  {mobileOpen ? <X size={22} /> : <Menu size={22} />}
                </Button>
              </>
            )}
          </div>
        </div>

        {mobileOpen && !isSignedOut && (
          <div className="max-h-[calc(100dvh-3.5rem)] overflow-y-auto border-t border-border bg-background lg:hidden">
            <nav className="mx-auto flex w-full max-w-7xl flex-col gap-1 px-4 py-3 sm:px-6" aria-label="Mobile">
              {clientSwitcher && <div className="pb-2">{clientSwitcher}</div>}
              <MobileSectionLabel>Content</MobileSectionLabel>
              {contentLinks.map((item) => (
                <MobileNavLink key={item.label} item={item} />
              ))}
              {radarLinks.length > 0 && (
                <>
                  <MobileSectionLabel>Radar</MobileSectionLabel>
                  {radarLinks.map((item) => (
                    <MobileNavLink key={item.label} item={item} />
                  ))}
                </>
              )}
              {developerLinks.length > 0 && (
                <>
                  <MobileSectionLabel>Developers</MobileSectionLabel>
                  {developerLinks.map((item) => (
                    <MobileNavLink key={item.label} item={item} />
                  ))}
                </>
              )}
              <MobileSectionLabel>Account</MobileSectionLabel>
              {accountLinks.map((item) => (
                <MobileNavLink key={item.label} item={item} />
              ))}
              <div className="mt-2 flex flex-col gap-1 border-t border-border pt-2">
                {mounted && (
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
                    {theme === "dark" ? "Light mode" : "Dark mode"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-brand-primary hover:bg-brand-primary/10"
                >
                  <LogOut size={18} />
                  Log out
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {!isAdminView && <TrialStatusBanner />}

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  )
}

function MenuGroup({
  label,
  icon: Icon,
  active,
  items,
  header,
}: {
  label: string
  icon: React.ElementType
  active: boolean
  items: NavLinkItem[]
  header?: string | null
}) {
  const router = useRouter()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "relative flex items-center gap-2 px-3 text-sm font-medium transition-colors",
            active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon size={16} className={active ? "text-brand-primary" : undefined} />
          {label}
          <ChevronDown size={14} className="opacity-60" />
          {active && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-brand-primary" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-52">
        {header && (
          <>
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{header}</DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        {items.map((item) => (
          <DropdownMenuItem
            key={item.label}
            onSelect={() => router.push(item.href)}
            className={cn(item.active && "bg-accent")}
          >
            <item.icon size={16} />
            {item.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MobileNavLink({ item }: { item: NavLinkItem }) {
  return (
    <Link
      href={item.href}
      aria-current={item.active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors",
        item.active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
    >
      <item.icon size={18} className={item.active ? "text-brand-primary" : undefined} />
      {item.label}
    </Link>
  )
}

function MobileSectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</p>
}

export default AppLayout
export { AppLayout }
