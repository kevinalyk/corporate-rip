import { NextResponse } from "next/server"
import { clearBrandCookie } from "@/lib/brand-auth"

export async function POST() {
  const response = NextResponse.json({ ok: true })
  clearBrandCookie(response)
  return response
}
