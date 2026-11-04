"use client"

import { ChevronRight, EyeOff, Info, Mail, RefreshCw, Smartphone, Star, User, UserPlus } from "lucide-react"
import { cn } from "@/lib/utils"

export interface FeedItemCampaign {
  id: number | string
  type: "email" | "sms"
  senderName: string
  senderEmail: string
  subject: string
  dateReceived: string
  phoneNumber?: string
  entity?: { id: string; name: string } | null
  isHidden?: boolean
  sendCount?: number
  bodySendCount?: number
}

interface FeedItemProps {
  campaign: FeedItemCampaign
  preview: string
  blurred?: boolean
  dimmed?: boolean
  showPersonal?: boolean
  showFollowing?: boolean
  showThirdParty?: boolean
  showRepeats?: boolean
  canAssign?: boolean
  onOpen: () => void
  onAssign?: () => void
}

function Chip({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none",
        className,
      )}
    >
      {children}
    </span>
  )
}

export function FeedItem({
  campaign,
  preview,
  blurred,
  dimmed,
  showPersonal,
  showFollowing,
  showThirdParty,
  showRepeats,
  canAssign,
  onOpen,
  onAssign,
}: FeedItemProps) {
  const isSms = campaign.type === "sms"
  const name = campaign.entity?.name || campaign.senderName || "Unknown sender"
  const address = isSms ? campaign.phoneNumber : campaign.senderEmail
  const time = new Date(campaign.dateReceived).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
  const TypeIcon = isSms ? Smartphone : Mail
  const subjectRepeats = !isSms && (campaign.sendCount ?? 1) >= 2
  const bodyRepeats = !isSms && (campaign.bodySendCount ?? 1) >= 2
  const smsRepeats = isSms && (campaign.sendCount ?? 1) >= 2

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen()
        }
      }}
      className={cn(
        "group relative flex gap-3 px-4 py-4 sm:gap-4 sm:px-5 cursor-pointer transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:bg-muted/60",
        blurred && "blur-sm",
        dimmed && "opacity-60",
      )}
    >
      <span
        aria-hidden="true"
        className="absolute left-0 top-3 bottom-3 w-0.5 rounded-full bg-primary opacity-0 transition-opacity group-hover:opacity-100"
      />

      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
        {name.trim().charAt(0).toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate text-sm font-semibold text-foreground">{name}</span>
            <Chip className="border-transparent bg-muted text-muted-foreground">
              <TypeIcon className="h-3 w-3" />
              {isSms ? "SMS" : "Email"}
            </Chip>
            {dimmed && (
              <Chip className="bg-muted text-muted-foreground">
                <EyeOff className="h-3 w-3" />
                Hidden
              </Chip>
            )}
            {showPersonal && (
              <Chip className="border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-900 dark:text-blue-200">
                <User className="h-3 w-3" />
                Personal
              </Chip>
            )}
            {showFollowing && (
              <Chip className="border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900 dark:text-amber-200">
                <Star className="h-3 w-3" />
                Following
              </Chip>
            )}
            {showThirdParty && (
              <Chip className="border-border bg-muted text-muted-foreground">
                <Info className="h-3 w-3" />
                Third party
              </Chip>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
            <span className="tabular-nums">{time}</span>
            <ChevronRight className="hidden h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100 sm:block" />
          </div>
        </div>

        {campaign.subject && (
          <p className="mt-1.5 line-clamp-2 break-words text-[15px] font-medium leading-snug text-foreground">
            {campaign.subject}
          </p>
        )}
        {preview && <p className="mt-1 line-clamp-1 break-words text-sm text-muted-foreground">{preview}</p>}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
          {address && <span className="truncate">{address}</span>}
          {showRepeats && subjectRepeats && (
            <Chip className="border-purple-300 bg-purple-100 text-purple-800 dark:border-purple-700 dark:bg-purple-950 dark:text-purple-300">
              <RefreshCw className="h-3 w-3" />
              Subject sent {campaign.sendCount}x
            </Chip>
          )}
          {showRepeats && bodyRepeats && (
            <Chip className="border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-300">
              <RefreshCw className="h-3 w-3" />
              Body sent {campaign.bodySendCount}x
            </Chip>
          )}
          {showRepeats && smsRepeats && (
            <Chip className="border-green-300 bg-green-100 text-green-800 dark:border-green-700 dark:bg-green-950 dark:text-green-300">
              <RefreshCw className="h-3 w-3" />
              Sent {campaign.sendCount}x
            </Chip>
          )}
          {canAssign && onAssign && (
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation()
                onAssign()
              }}
            >
              <UserPlus className="h-3 w-3" />
              {campaign.entity ? "Assign sender" : "Assign to entity"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
