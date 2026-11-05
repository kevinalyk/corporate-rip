"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Eye, EyeOff } from "lucide-react"
import Link from "next/link"
import { AuthShell } from "@/components/auth-shell"

function validatePassword(password: string) {
  if (password.length < 12) return "Password must be at least 12 characters long"
  if (!/\d/.test(password)) return "Password must contain at least one number"
  if (!/[a-zA-Z]/.test(password)) return "Password must contain at least one letter"
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return "Password must contain at least one symbol"
  return null
}

export default function SignupPage() {
  const [loadTime, setLoadTime] = useState(0)
  const [formData, setFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    jobTitle: "",
    password: "",
    confirmPassword: "",
    agreeToTerms: false,
    website: "",
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoadTime(Date.now())
  }, [])

  const update = (field: keyof typeof formData) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFormData({ ...formData, [field]: e.target.value })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    if (formData.website) {
      setError("Invalid submission detected")
      return
    }
    if (Date.now() - loadTime < 3000) {
      setError("Please take your time filling out the form")
      return
    }
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.password) {
      setError("Please fill in all required fields")
      return
    }
    if (!formData.agreeToTerms) {
      setError("You must agree to the Terms of Service and Privacy Policy to continue")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError("Please enter a valid email address")
      return
    }
    const passwordError = validatePassword(formData.password)
    if (passwordError) {
      setError(passwordError)
      return
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setLoading(true)
    try {
      const response = await fetch("/api/brand/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: formData.firstName,
          lastName: formData.lastName,
          email: formData.email,
          company: formData.company,
          jobTitle: formData.jobTitle,
          password: formData.password,
          agreeToTerms: formData.agreeToTerms,
          _hp: formData.website,
          _ts: loadTime,
        }),
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || "Signup failed")
      }
      window.location.href = "/account"
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred during signup")
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <Card className="w-full border-0 shadow-none lg:border lg:shadow-sm">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>Sign up to get started with brandinbox.ai</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              name="website"
              value={formData.website}
              onChange={update("website")}
              style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px" }}
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" autoComplete="given-name" value={formData.firstName} onChange={update("firstName")} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" autoComplete="family-name" value={formData.lastName} onChange={update("lastName")} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Work Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="name@company.com"
                value={formData.email}
                onChange={update("email")}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="company">
                  Company <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input id="company" autoComplete="organization" value={formData.company} onChange={update("company")} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="jobTitle">
                  Job Title <span className="text-muted-foreground font-normal">(optional)</span>
                </Label>
                <Input id="jobTitle" autoComplete="organization-title" value={formData.jobTitle} onChange={update("jobTitle")} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={update("password")}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">Min 12 characters, 1 number, 1 letter, 1 symbol</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={formData.confirmPassword}
                  onChange={update("confirmPassword")}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-start gap-2 pt-2">
              <Checkbox
                id="agreeToTerms"
                checked={formData.agreeToTerms}
                onCheckedChange={(checked) => setFormData({ ...formData, agreeToTerms: checked === true })}
              />
              <label htmlFor="agreeToTerms" className="text-sm leading-relaxed cursor-pointer">
                I agree to the{" "}
                <Link href="/terms" target="_blank" className="text-brand-secondary hover:underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" target="_blank" className="text-brand-secondary hover:underline">
                  Privacy Policy
                </Link>
              </label>
            </div>

            <Button type="submit" variant="branded" className="w-full" disabled={loading}>
              {loading ? "Creating account..." : "Create Account"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link href="/login" className="text-brand-secondary hover:underline">
              Sign in
            </Link>
          </p>
        </CardFooter>
      </Card>
    </AuthShell>
  )
}
