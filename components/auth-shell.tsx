import type React from "react"
import Image from "next/image"
import { Mail, MessageSquare, TrendingUp } from "lucide-react"
import { BrandWordmark } from "@/components/brand-wordmark"

const previewCards = [
  {
    icon: Mail,
    channel: "Email",
    title: "Last chance: 25% off ends tonight",
    meta: "Retail  ·  6:06 PM",
    className: "left-0 top-0 w-72",
    delay: "0s",
    float: "0s",
  },
  {
    icon: MessageSquare,
    channel: "SMS",
    title: "Your cart misses you. Finish your order today.",
    meta: "Ecommerce  ·  5:48 PM",
    className: "right-0 top-28 w-72",
    delay: "0.25s",
    float: "-2.5s",
  },
  {
    icon: TrendingUp,
    channel: "Insight",
    title: "Promo frequency up 18% across your category",
    meta: "This week",
    className: "left-10 top-60 w-72",
    delay: "0.5s",
    float: "-5s",
  },
]

function BrandPanel() {
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
            See every message your market sends.
          </h2>
          <p className="max-w-md text-pretty text-lg text-indigo-100/80">
            Emails and texts from the brands you compete with, organized in one place.
          </p>
        </div>

        <div className="relative h-[21rem] w-full max-w-md" aria-hidden="true">
          {previewCards.map(({ icon: Icon, channel, title, meta, className, delay, float }) => (
            <div key={title} className={`absolute ${className} auth-card-in`} style={{ animationDelay: delay }}>
              <div
                className="auth-float rounded-2xl border border-white/15 bg-white/10 p-4 shadow-xl shadow-black/20 backdrop-blur-md"
                style={{ animationDelay: float }}
              >
                <div className="mb-2 flex items-center gap-2 text-xs font-medium text-indigo-100/80">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/15">
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  {channel}
                </div>
                <p className="text-sm font-semibold leading-snug">{title}</p>
                <p className="mt-2 text-xs text-indigo-100/60">{meta}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <p className="relative z-10 text-sm text-indigo-100/60">
        &copy; {new Date().getFullYear()} brandinbox.ai
      </p>
    </aside>
  )
}

interface AuthShellProps {
  children: React.ReactNode
}

export function AuthShell({ children }: AuthShellProps) {
  return (
    <main className="grid min-h-dvh bg-background lg:grid-cols-2">
      <BrandPanel />
      <section className="flex flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
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
        <div className="auth-card-in w-full max-w-md" style={{ animationDelay: "0.2s" }}>
          {children}
        </div>
      </section>
    </main>
  )
}
