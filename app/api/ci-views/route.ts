import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { neon } from "@neondatabase/serverless"

const sql = neon(process.env.DATABASE_URL!)

type SessionResult = { userId: string } | { response: NextResponse }

// Saved views belong to RIP users (User table). Brand accounts are a separate
// user space, so they get an empty list on read and a 403 on write.
async function requireRipUser(): Promise<SessionResult> {
  const session = (await getCurrentUser()) as any
  if (!session?.userId) {
    return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  if (session.brand) {
    return {
      response: NextResponse.json({ error: "Saved views are not available for brand accounts yet" }, { status: 403 }),
    }
  }
  return { userId: session.userId }
}

// GET - Fetch the signed-in user's views for the selected client context.
export async function GET(request: NextRequest) {
  try {
    const session = (await getCurrentUser()) as any
    if (!session?.userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (session.brand) {
      return NextResponse.json({ views: [] })
    }
    const userId: string = session.userId

    const searchParams = request.nextUrl.searchParams
    const clientSlug = searchParams.get("clientSlug")

    if (!clientSlug) {
      return NextResponse.json({ error: "Client slug is required" }, { status: 400 })
    }

    const userResult = await sql`
      SELECT "clientId", role 
      FROM "User" 
      WHERE id = ${userId}
    `

    if (!userResult || userResult.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Super admins view the selected client; everyone else uses their own.
    let clientId = userResult[0].clientId
    if (userResult[0].role === "super_admin") {
      const targetClientResult = await sql`
        SELECT id 
        FROM "Client" 
        WHERE slug = ${clientSlug}
      `
      if (targetClientResult && targetClientResult.length > 0) {
        clientId = targetClientResult[0].id
      }
    }

    // Personal ownership is always the authenticated user, including when a
    // super-admin is viewing another client context.
    const views = await sql`
      SELECT 
        id,
        name,
        "filterSettings",
        "createdBy",
        "createdAt",
        "updatedAt"
      FROM "UserCiView"
      WHERE "clientId" = ${clientId} AND "createdBy" = ${userId}
      ORDER BY "createdAt" DESC
    `

    return NextResponse.json({ views })
  } catch (error) {
    console.error("Error fetching CI views:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST - Create a new view
export async function POST(request: NextRequest) {
  try {
    const session = await requireRipUser()
    if ("response" in session) return session.response
    const { userId } = session

    const body = await request.json()
    const { name, filterSettings, clientSlug } = body

    if (!name || !filterSettings || !clientSlug) {
      return NextResponse.json({ error: "Name, filterSettings, and clientSlug are required" }, { status: 400 })
    }

    const userResult = await sql`
      SELECT "clientId", role
      FROM "User" 
      WHERE id = ${userId}
    `

    if (!userResult || userResult.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    let clientId = userResult[0].clientId
    if (userResult[0].role === "super_admin") {
      const targetClientResult = await sql`
        SELECT id FROM "Client" WHERE slug = ${clientSlug}
      `
      if (targetClientResult && targetClientResult.length > 0) {
        clientId = targetClientResult[0].id
      }
    }

    const viewId = crypto.randomUUID()
    const now = new Date()

    await sql`
      INSERT INTO "UserCiView" (
        id,
        name,
        "clientId",
        "filterSettings",
        "createdBy",
        "createdAt",
        "updatedAt"
      ) VALUES (
        ${viewId},
        ${name},
        ${clientId},
        ${JSON.stringify(filterSettings)},
        ${userId},
        ${now},
        ${now}
      )
    `

    const view = {
      id: viewId,
      name,
      filterSettings,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    }

    return NextResponse.json({ view }, { status: 201 })
  } catch (error) {
    console.error("Error creating CI view:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// PUT - Update an existing view
export async function PUT(request: NextRequest) {
  try {
    const session = await requireRipUser()
    if ("response" in session) return session.response
    const { userId } = session

    const body = await request.json()
    const { id, name, filterSettings } = body

    if (!id) {
      return NextResponse.json({ error: "View ID is required" }, { status: 400 })
    }

    const userResult = await sql`
      SELECT "clientId" 
      FROM "User" 
      WHERE id = ${userId}
    `

    if (!userResult || userResult.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const clientId = userResult[0].clientId

    // Only the creator may update a personal saved view.
    const viewCheck = await sql`
      SELECT id 
      FROM "UserCiView"
      WHERE id = ${id} AND "clientId" = ${clientId} AND "createdBy" = ${userId}
    `

    if (!viewCheck || viewCheck.length === 0) {
      return NextResponse.json({ error: "View not found or access denied" }, { status: 404 })
    }

    const now = new Date()

    const updates: string[] = []
    const values: Array<string | Date> = []

    if (name !== undefined) {
      updates.push(`name = $${values.length + 1}`)
      values.push(name)
    }

    if (filterSettings !== undefined) {
      updates.push(`"filterSettings" = $${values.length + 1}`)
      values.push(JSON.stringify(filterSettings))
    }

    updates.push(`"updatedAt" = $${values.length + 1}`)
    values.push(now)

    values.push(id)
    values.push(userId)

    await sql.unsafe(
      `
      UPDATE "UserCiView"
      SET ${updates.join(", ")}
      WHERE id = $${values.length - 1} AND "createdBy" = $${values.length}
    `,
      values,
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating CI view:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// DELETE - Delete a view
export async function DELETE(request: NextRequest) {
  try {
    const session = await requireRipUser()
    if ("response" in session) return session.response
    const { userId } = session

    const searchParams = request.nextUrl.searchParams
    const viewId = searchParams.get("id")

    if (!viewId) {
      return NextResponse.json({ error: "View ID is required" }, { status: 400 })
    }

    const userResult = await sql`
      SELECT "clientId" 
      FROM "User" 
      WHERE id = ${userId}
    `

    if (!userResult || userResult.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    const clientId = userResult[0].clientId

    // Delete only the authenticated user's personal copy.
    const result = await sql`
      DELETE FROM "UserCiView"
      WHERE id = ${viewId} AND "clientId" = ${clientId} AND "createdBy" = ${userId}
      RETURNING id
    `

    if (!result || result.length === 0) {
      return NextResponse.json({ error: "View not found or access denied" }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting CI view:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
