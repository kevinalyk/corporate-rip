"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  ChevronLeft,
  ChevronRight,
  Mail,
  Settings,
  Users,
  LogOut,
  Moon,
  Sun,
  UserCog,
  BarChart3,
  Lightbulb,
  CreditCard,
  Plug,
  Building2,
  ChevronDown,
  ChevronUp,
  LayoutDashboard,
  Inbox,
  Building,
  Star,
  Globe,
  ScanSearch,
  MailCheck,
  Code,
  Key,
  Smartphone,
  Bot,
} from "lucide-react"
import useSWR from "swr"
import { Logo } from "@/components/logo"
import { useTheme } from "next-themes"
import { Separator } from "@/components/ui/separator"
import { useDomain } from "@/lib/domain-context"
import { useCurrentUser } from "@/lib/hooks/use-current-user"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface Client {
  id: string
  name: string
  slug: string
}

interface SidebarProps {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  isAdminView?: boolean
  clientSlug?: string
  onNavigate?: () => void
  className?: string
}

// Paths that are not client-scoped — don't overwrite the selected client slug. Hoisted
// to module scope (rather than redeclared as a new array literal on every render
// inside the component) so it's referentially stable and can be safely listed as an
// effect dependency below without causing those effects to re-run on every render.
const NON_CLIENT_PATHS = ["news", "login", "share", "directory", "digest", "about", "privacy", "terms", "lookup"]

export function Sidebar({ collapsed, setCollapsed, isAdminView = false, onNavigate, className }: SidebarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  // Only `selectedDomain` is used here, for the non-super-admin client-slug fallback
  // below — the rest of useDomain()'s return value is intentionally not needed by
  // this component, so it's left out of the destructure entirely rather than bound
  // to unused local names.
  const { selectedDomain } = useDomain()
  const { user: currentUser, loading: userLoading } = useCurrentUser()
  const userRole = currentUser?.role ?? null
  const authLoaded = !userLoading
  const [clients, setClients] = useState<Client[]>([])
  const [loadingClients, setLoadingClients] = useState(false)
  const [selectedClientSlug, setSelectedClientSlug] = useState<string>("")

  // Developers section is a pilot: visible to super admins and to users of the
  // pilot clients (brandinbox.ai, Red Spark Strategy) while those clients are selected.
  // The MCP Access item additionally requires a qualifying plan (Professional / Enterprise).
  const showDevelopersNav =
    userRole !== null && (selectedClientSlug === "rip" || selectedClientSlug === "redsparkstrategy")
  const { data: mcpStatus } = useSWR<{ eligible: boolean } | null>(
    showDevelopersNav ? `/api/client-mcp/status?clientSlug=${selectedClientSlug}` : null,
    (url: string) => fetch(url, { credentials: "include" }).then((res) => (res.ok ? res.json() : null)),
    { revalidateOnFocus: false },
  )

  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    ci: false,
    radar: false,
    inbox: false,
    developers: false,
    account: false,
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    const fetchClients = async () => {
      if (userRole !== "super_admin") return

      setLoadingClients(true)
      try {
        const response = await fetch("/api/clients", {
          credentials: "include",
        })
        if (response.ok) {
          const data = await response.json()
          setClients(data)
        }
      } catch (error) {
        console.error("Error fetching clients:", error)
      } finally {
        setLoadingClients(false)
      }
    }
    fetchClients()
  }, [userRole])

  useEffect(() => {
    const pathParts = pathname.split("/").filter(Boolean)
    if (pathParts.length === 0) return
    if (NON_CLIENT_PATHS.includes(pathParts[0])) return // preserve existing selection
    if (pathParts[0] === "admin") {
      setSelectedClientSlug("admin")
    } else {
      setSelectedClientSlug(pathParts[0])
    }
  }, [pathname])

  // Auto-select brandinbox.ai for super_admins on initial load
  useEffect(() => {
    if (userRole === "super_admin" && clients.length > 0 && !selectedClientSlug) {
      const ripClient = clients.find((client) => client.slug === "rip")
      if (ripClient) {
        setSelectedClientSlug("rip")
        // Only navigate away if on a truly rootless path (not a public path like /news)
        const pathParts = pathname.split("/").filter(Boolean)
        const isOnPublicPath = NON_CLIENT_PATHS.includes(pathParts[0])
        if (!isOnPublicPath && (pathParts.length === 0 || pathParts[0] === "admin")) {
          router.push("/rip/ci/campaigns")
        }
      }
    }
  }, [userRole, clients, selectedClientSlug, pathname, router])

  useEffect(() => {
    if (pathname.includes("/account/")) {
      setExpandedSections((prev) => ({ ...prev, account: true }))
    } else if (pathname.includes("/ci/")) {
      setExpandedSections((prev) => ({ ...prev, ci: true }))
    } else if (pathname === "/directory" || pathname.startsWith("/directory/")) {
      setExpandedSections((prev) => ({ ...prev, radar: true }))
    } else if (pathname.includes("/inbox/")) {
      setExpandedSections((prev) => ({ ...prev, inbox: true }))
    } else if (pathname.includes("/developers/")) {
      setExpandedSections((prev) => ({ ...prev, developers: true }))
    }
  }, [pathname])

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark")
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
      })
      router.push("/login")
    } catch (error) {
      console.error("Logout error:", error)
    }
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const isCurrentlyOpen = prev[section]
      // Close all sections, then open the clicked one (unless it was already open)
      const allClosed = Object.fromEntries(Object.keys(prev).map((k) => [k, false]))
      return { ...allClosed, [section]: !isCurrentlyOpen }
    })
  }

  const getClientSlug = () => {
    if (selectedClientSlug && selectedClientSlug !== "admin") {
      return selectedClientSlug
    }
    return isAdminView ? "admin" : selectedDomain?.client?.slug || currentUser?.client?.slug || "admin"
  }

  const navigate = (path: string) => {
    router.push(path)
    onNavigate?.()
  }

  const handleClientSwitch = (newClientSlug: string) => {
    const pathParts = pathname.split("/").filter(Boolean)

    // Preserve all admin paths when switching clients
    if (pathParts[0] === "admin") {
      // Preserve the path after /admin (e.g., /admin/inbox/campaigns -> /newClient/inbox/campaigns)
      const restOfPath = pathParts.slice(1).join("/")
      if (restOfPath) {
        router.push(`/${newClientSlug}/${restOfPath}`)
      } else {
        router.push(`/${newClientSlug}/ci/campaigns`)
      }
      return
    }

    // For regular client routes, just replace the clientSlug
    if (pathParts.length > 0) {
      pathParts[0] = newClientSlug
      const newPath = `/${pathParts.join("/")}`
      router.push(newPath)
    } else {
      router.push(`/${newClientSlug}/ci/campaigns`)
    }
  }

  const isPublicPath =
    pathname === "/news" || pathname.startsWith("/news/") ||
    pathname === "/directory" || pathname.startsWith("/directory/")
  const isUnauthenticated = authLoaded && !userRole

  // Minimal sidebar for unauthenticated visitors on public pages
  if (isPublicPath && isUnauthenticated) {
    return (
      <div
        className={cn(
          "fixed left-0 top-0 h-full bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out flex flex-col z-50",
          collapsed ? "w-16" : "w-64",
          className,
        )}
      >
        <div className="p-4 flex justify-between items-center border-b border-sidebar-border">
          <div className="flex-1 flex justify-center">
            <Logo collapsed={collapsed} variant="icon" />
          </div>
          {/* h-11/w-11 (44px) on mobile — this Sidebar also renders as the touch-driven
              mobile drawer (see components/app-layout.tsx) — falling back to the
              denser 32px desktop size at md+. */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="h-11 w-11 md:h-8 md:w-8"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </Button>
        </div>

        {/* Safe-area inset added on top of p-4 (not a replacement) via calc() on
            padding-bottom only, and min-h-11 (44px) on each button below — same
            reasoning as the authenticated sidebar's bottom section further down
            this file. This block also renders in the touch-driven mobile drawer
            (components/app-layout.tsx) for signed-out visitors on public pages. */}
        <div
          className="p-4 mt-auto"
          style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
        >
          <Separator className="mb-4 bg-sidebar-border" />
          <div className="space-y-1">
            {mounted && (
              <Button
                variant="ghost"
                size="sm"
                className={cn("w-full justify-start gap-3 px-3 min-h-11 md:min-h-0", collapsed && "justify-center")}
                onClick={toggleTheme}
              >
                {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
                {!collapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "w-full justify-start gap-3 px-3 min-h-11 md:min-h-0 text-brand-primary hover:text-brand-primary hover:bg-brand-primary/10",
                collapsed && "justify-center",
              )}
              onClick={() => navigate("/login")}
            >
              <LogOut size={20} className="rotate-180" />
              {!collapsed && <span>Log In</span>}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
    <div
      className={cn(
        "fixed left-0 top-0 h-full bg-sidebar border-r border-sidebar-border transition-all duration-300 ease-in-out flex flex-col z-50",
        collapsed ? "w-16" : "w-64",
        className,
      )}
    >
      <div className="flex flex-col min-h-0 flex-grow">
        <div className="p-4 flex justify-between items-center border-b border-sidebar-border">
          <div className="flex-1 flex justify-center">
            <Logo collapsed={collapsed} variant="icon" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="h-11 w-11 md:h-8 md:w-8"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </Button>
        </div>

        {userRole === "super_admin" && !collapsed && (
          <div className="px-4 mt-3 mb-1">
            <Select value={selectedClientSlug} onValueChange={handleClientSwitch} disabled={loadingClients}>
              <SelectTrigger className="w-full bg-transparent">
                <div className="flex items-center gap-2">
                  <Building size={16} className="text-brand-secondary" />
                  <SelectValue placeholder={loadingClients ? "Loading clients..." : "Select Client"} />
                </div>
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.slug}>
                    {client.name}
                  </SelectItem>
                ))}
                {clients.length === 0 && !loadingClients && (
                  <SelectItem value="none" disabled>
                    No clients available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex-1 py-4 overflow-y-auto">
          <nav className="space-y-1 px-2">
            <NavSection
              icon={<Lightbulb size={20} />}
              label="Content"
              collapsed={collapsed}
              expanded={expandedSections.ci}
              onToggle={() => toggleSection("ci")}
            />
            {expandedSections.ci && !collapsed && (
              <div className="ml-4 space-y-1">
                <NavItem
                  icon={<LayoutDashboard size={18} />}
                  label="Feed"
                  active={pathname.includes("/ci/campaigns")}
                  collapsed={false}
                  onClick={() => navigate(`/${getClientSlug()}/ci/campaigns`)}
                />
                <NavItem
                  icon={<Star size={18} />}
                  label="Following"
                  active={pathname.includes("/ci/subscriptions")}
                  collapsed={false}
                  onClick={() => navigate(`/${getClientSlug()}/ci/subscriptions`)}
                />
                <NavItem
                  icon={<Mail size={18} />}
                  label="Personal Email"
                  active={pathname.includes("/ci/personal") && !pathname.includes("/ci/personal-numbers")}
                  collapsed={false}
                  onClick={() => navigate(`/${getClientSlug()}/ci/personal`)}
                />
                <NavItem
                  icon={<Smartphone size={18} />}
                  label="Personal Numbers"
                  active={pathname.includes("/ci/personal-numbers")}
                  collapsed={false}
                  onClick={() => navigate(`/${getClientSlug()}/ci/personal-numbers`)}
                />
              </div>
            )}

            {userRole === "super_admin" && (
              <>
                <NavSection
                  icon={<ScanSearch size={20} />}
                  label="Radar"
                  collapsed={collapsed}
                  expanded={expandedSections.radar}
                  onToggle={() => toggleSection("radar")}
                />
                {expandedSections.radar && !collapsed && (
                  <div className="ml-4 space-y-1">
                    <NavItem
                      icon={<Building2 size={18} />}
                      label="Directory"
                      active={pathname === "/directory" || pathname.startsWith("/directory/")}
                      collapsed={false}
                      onClick={() => navigate("/directory")}
                    />
                  </div>
                )}
              </>
            )}

            {(selectedClientSlug === "rip" || !selectedClientSlug || selectedClientSlug === "redsparkstrategy") && (
              <>
                <NavSection
                  icon={<Inbox size={20} />}
                  label="Inbox Tools"
                  collapsed={collapsed}
                  expanded={expandedSections.inbox}
                  onToggle={() => toggleSection("inbox")}
                />
                {expandedSections.inbox && !collapsed && (
                  <div className="ml-4 space-y-1">
                    <NavItem
                      icon={<Globe size={18} />}
                      label="Domain Health"
                      active={pathname.includes("/inbox/domain-health")}
                      collapsed={false}
                      onClick={() => navigate(`/${getClientSlug()}/inbox/domain-health`)}
                    />
                    <NavItem
                      icon={<MailCheck size={18} />}
                      label="Spam Tester"
                      active={pathname.includes("/inbox/spam-test")}
                      collapsed={false}
                      onClick={() => navigate(`/${getClientSlug()}/inbox/spam-test`)}
                    />
                  </div>
                )}
              </>
            )}

            {showDevelopersNav && (
              <>
                <NavSection
                  icon={<Code size={20} />}
                  label="Developers"
                  collapsed={collapsed}
                  expanded={expandedSections.developers}
                  onToggle={() => toggleSection("developers")}
                />
                {expandedSections.developers && !collapsed && (
                  <div className="ml-4 space-y-1">
                    {userRole === "super_admin" && (
                      <NavItem
                        icon={<Key size={18} />}
                        label="API Keys"
                        active={pathname === `/${selectedClientSlug}/developers/api-keys`}
                        collapsed={false}
                        onClick={() => navigate(`/${selectedClientSlug}/developers/api-keys`)}
                      />
                    )}
                    {mcpStatus?.eligible && (
                      <NavItem
                        icon={<Bot size={18} />}
                        label="MCP Access"
                        active={pathname === `/${selectedClientSlug}/developers/mcp`}
                        collapsed={false}
                        onClick={() => navigate(`/${selectedClientSlug}/developers/mcp`)}
                      />
                    )}
                    {userRole === "super_admin" && (
                      <NavItem
                        icon={<BarChart3 size={18} />}
                        label="MCP Usage"
                        active={pathname === `/${selectedClientSlug}/developers/mcp-usage`}
                        collapsed={false}
                        onClick={() => navigate(`/${selectedClientSlug}/developers/mcp-usage`)}
                      />
                    )}
                  </div>
                )}
              </>
            )}

            <NavSection
              icon={<UserCog size={20} />}
              label="Account"
              collapsed={collapsed}
              expanded={expandedSections.account}
              onToggle={() => toggleSection("account")}
            />
            {expandedSections.account && !collapsed && (
              <div className="ml-4 space-y-1">
                <NavItem
                  icon={<Settings size={18} />}
                  label="Settings"
                  active={pathname.includes("/account/settings")}
                  collapsed={false}
                  onClick={() => navigate(`/${getClientSlug()}/account/settings`)}
                />
                <NavItem
                  icon={<Users size={18} />}
                  label="Users"
                  active={pathname.includes("/account/users")}
                  collapsed={false}
                  onClick={() => navigate(`/${getClientSlug()}/account/users`)}
                />
                <NavItem
                  icon={<CreditCard size={18} />}
                  label="Billing"
                  active={pathname.includes("/account/billing")}
                  collapsed={false}
                  onClick={() => navigate(`/${getClientSlug()}/account/billing`)}
                />
              <NavItem
              icon={<Plug size={18} />}
              label="Integrations"
              active={pathname.includes("/account/integrations")}
              collapsed={false}
              onClick={() => navigate(`/${getClientSlug()}/account/integrations`)}
              />
              </div>
            )}
          </nav>
        </div>
      </div>

      {/* Safe-area inset is added ON TOP of the normal p-4 padding (not a replacement
          for it) via an explicit calc() on padding-bottom only — same reasoning as the
          mobile header's paddingTop in components/app-layout.tsx. The standalone
          `.pb-safe` utility in globals.css sets padding-bottom outright, which would
          otherwise clobber p-4's padding-bottom entirely once both target the same
          property. Without this, the Logout/theme/etc. buttons in this touch-driven
          mobile drawer sit flush against an iPhone's home-indicator safe area. */}
      <div
        className="p-4 mt-auto border-t border-sidebar-border"
        style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
      >
        <div className="space-y-1">
          {/* min-h-11 (44px) covers these controls in the touch-driven mobile drawer
              (components/app-layout.tsx) — same reasoning as NavSection/NavItem above;
              md:min-h-0 lets the default size="sm" (32px) govern the denser desktop
              sidebar unchanged. */}
          {mounted && (
            <Button
              variant="ghost"
              size="sm"
              className={cn("w-full justify-start gap-3 px-3 min-h-11 md:min-h-0", collapsed && "justify-center")}
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
              {!collapsed && <span>{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "w-full justify-start gap-3 px-3 min-h-11 md:min-h-0 text-brand-primary hover:text-brand-primary hover:bg-brand-primary/10",
              collapsed && "justify-center",
            )}
            onClick={handleLogout}
          >
            <LogOut size={20} />
            {!collapsed && <span>Logout</span>}
          </Button>
        </div>
      </div>
    </div>
    </>
  )
}

interface NavSectionProps {
  icon: React.ReactNode
  label: string
  collapsed: boolean
  expanded: boolean
  onToggle: () => void
}

function NavSection({ icon, label, collapsed, expanded, onToggle }: NavSectionProps) {
  return (
  <Button
  variant="ghost"
  className={cn(
  // min-h-11 (44px) covers this control in the touch-driven mobile drawer
  // (components/app-layout.tsx); md:min-h-0 lets the default h-9 govern the
  // denser desktop sidebar unchanged.
  "relative w-full justify-start gap-3 px-3 font-medium min-h-11 md:min-h-0",
  expanded && "bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/15 hover:text-brand-primary",
  collapsed && "justify-center",
  )}
  onClick={onToggle}
  >
      {expanded && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand-primary" aria-hidden="true" />
      )}
      {icon}
      {!collapsed && (
        <>
          <span className="flex-1 text-left">{label}</span>
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </>
      )}
    </Button>
  )
}

interface NavItemProps {
  icon: React.ReactNode
  label: string
  active: boolean
  collapsed: boolean
  onClick: () => void
}

function NavItem({ icon, label, active, collapsed, onClick }: NavItemProps) {
  return (
  <Button
  variant={active ? "secondary" : "ghost"}
  size="sm"
  className={cn(
  // Same mobile-drawer touch-target reasoning as NavSection above.
  "relative w-full justify-start gap-3 px-3 min-h-11 md:min-h-0",
  active && "bg-brand-primary/10 hover:bg-brand-primary/15 text-brand-primary hover:text-brand-primary",
  collapsed && "justify-center",
  )}
  onClick={onClick}
  >
      {active && (
        <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-brand-primary" aria-hidden="true" />
      )}
      {icon}
      {!collapsed && <span>{label}</span>}
    </Button>
  )
}
