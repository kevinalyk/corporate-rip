import { NextResponse } from "next/server"

export async function POST() {
  const response = NextResponse.json({ success: true })

  // Clear without domain — matches exactly how the login route sets the cookie
  response.cookies.set({
    name: "auth_token",
    value: "",
    expires: new Date(0),
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  })

  response.cookies.set({
    name: "brand_token",
    value: "",
    expires: new Date(0),
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  })

  // Also clear with domain as a belt-and-suspenders in case an old cookie exists
  response.cookies.set({
    name: "auth_token",
    value: "",
    expires: new Date(0),
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    domain: ".brandinbox.ai",
  })

  return response
}
