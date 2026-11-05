import type React from "react"
import Image from "next/image"
import { Check, Mail, MessageSquare, Radar, Search, TrendingUp, type LucideIcon } from "lucide-react"
import { BrandWordmark } from "@/components/brand-wordmark"

type AuthVariant = "login" | "signup"

interface FloatingCard {
  icon: LucideIcon
  label: string
  title: string
  meta: string
  className: string
  delay: string
  float: string
}

const loginContent = {
  headline: "Your market, at a glance.",
  description: "Jump back into the feed, search every message, and keep watch on the brands that matter to you.",
  cards: [
    {
      icon: Mail,
      label: "Feed",
      title: "Every email and text, in one stream",
      meta: "Updated moments ago",
      className: "left-0 top-0 w-72",
      delay: "0s",
      float: "0s",
    },
    {
      icon: Search,
      label: "Search",
      title: "Find any subject line, offer, or sender",
      meta: "Across your whole archive",
      className: "right-0 top-28 w-72",
      delay: "0.25s",
      float: "-2.5s",
    },
    {
      icon: Radar,
      label: "Radar",
      title: "Track the brands you compete with",
      meta: "Saved views and alerts",
      className: "left-10 top-60 w-72",
      delay: "0.5s",
      float: "-5s",
    },
  ] satisfies FloatingCard[],
}

const signupContent = {
  headline: "Know what competitors send before your customers do.",
  description: "Create your account and start seeing the emails and texts your market is sending, automatically.",
  benefits: [
    {
      icon: Mail,
      title: "Every message, captured",
      body: "Competitor emails and texts land in one organized feed, with no manual forwarding.",
    },
    {
      icon: TrendingUp,
      title: "Spot trends early",
      body: "See shifts in promo cadence, offers, and messaging across your category.",
    },
    {
      icon: MessageSquare,
      title: "A searchable archive",
      body: "Look up subject lines, creative, and senders from any brand, any time.",
    },
  ],
}

function BrandPanel({ variant }: { variant: AuthVariant }) {
  return (
    <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#4c1d95] text-white lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      <div className="auth-glow pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-500/40 blur-3xl" />
      <div
        className="auth-glow pointer-events-none absolute -bottom-32 -right-24 h-[28rem] w-[28rem] rounded-full bg-violet-500/40 blur-3xl"
        style={{ animationDelay: "-4s" }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)",
          backgroundSize: "28px 28px",
        }}
      />

      <div className="auth-card-in relative z-10 flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white shadow-lg shadow-black/20">
          <Image
            src="/images/IconOnly_Transparent_NoBuffer.png"
            alt=""
            width={32}
            height={32}
            className="h-8 w-8 object-contain"
            priority
          />
        </div>
        <span className="text-2xl font-bold tracking-tight">
          brandinbox<span className="text-violet-300">.ai</span>
        </span>
      </div>

      <div className="relative z-10 space-y-10">
        <div className="auth-card-in space-y-4" style={{ animationDelay: "0.15s" }}>
          <h2 className="max-w-md text-balance text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
            {variant === "login" ? loginContent.headline : signupContent.headline}
          </h2>
          <p className="max-w-md text-pretty text-lg text-indigo-100/80">
            {variant === "login" ? loginContent.description : signupContent.description}
          </p>
        </div>

        {variant === "login" ? (
          <div className="relative h-[21rem] w-full max-w-md" aria-hidden="true">
            {loginContent.cards.map(({ icon: Icon, label, title, meta, className, delay, float }) => (
              <div key={title} className={`absolute ${className} auth-card-in`} style={{ animationDelay: delay }}>
                <div
                  className="auth-float rounded-2xl border border-white/15 bg-white/10 p-4 shadow-xl shadow-black/20 backdrop-blur-md"
                  style={{ animationDelay: float }}
                >
                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-indigo-100/80">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/15">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    {label}
                  </div>
                  <p className="text-sm font-semibold leading-snug">{title}</p>
                  <p className="mt-2 text-xs text-indigo-100/60">{meta}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <ul className="w-full max-w-md space-y-3">
            {signupContent.benefits.map(({ icon: Icon, title, body }, index) => (
              <li
                key={title}
                className="auth-card-in flex gap-4 rounded-2xl border border-white/15 bg-white/10 p-4 shadow-xl shadow-black/20 backdrop-blur-md"
                style={{ animationDelay: `${0.3 + index * 0.15}s` }}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15">
                  <Icon className="h-5 w-5" />
                </span>
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    {title}
                    <Check className="h-3.5 w-3.5 text-violet-300" aria-hidden="true" />
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-indigo-100/70">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="relative z-10 text-sm text-indigo-100/60">
        &copy; {new Date().getFullYear()} brandinbox.ai
      </p>
    </aside>
  )
}

interface AuthShellProps {
  variant: AuthVariant
  title: string
  description: string
  footer: React.ReactNode
  children: React.ReactNode
}

export function AuthShell({ variant, title, description, footer, children }: AuthShellProps) {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-2">
      <BrandPanel variant={variant} />
      <section className="flex flex-col items-center justify-center px-6 py-12 sm:px-10">
        <div className="mb-10 flex flex-col items-center gap-3 lg:hidden">
          <div className="relative h-16 w-16">
            <Image
              src="/images/IconOnly_Transparent_NoBuffer.png"
              alt="brandinbox.ai"
              fill
              style={{ objectFit: "contain" }}
              priority
            />
          </div>
          <BrandWordmark className="text-3xl" />
        </div>

        <div className="auth-card-in w-full max-w-sm" style={{ animationDelay: "0.2s" }}>
          <header className="mb-8 space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
            <p className="text-pretty text-muted-foreground">{description}</p>
          </header>

          <div className="[&_input:not([type=checkbox])]:h-11 [&_button[type=submit]]:h-11 [&_button[type=submit]]:text-base">
            {children}
          </div>

          <footer className="mt-8 border-t border-border pt-6 text-center text-sm text-muted-foreground">
            {footer}
          </footer>
        </div>
      </section>
    </main>
  )
}
