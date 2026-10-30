import { cn } from "@/lib/utils"

interface BrandWordmarkProps {
  className?: string
}

export function BrandWordmark({ className }: BrandWordmarkProps) {
  return (
    <span className={cn("font-bold tracking-tight text-foreground", className)}>
      brandinbox<span className="text-[#7c3aed]">.ai</span>
    </span>
  )
}
