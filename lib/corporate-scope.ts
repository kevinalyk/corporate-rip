import { Prisma } from "@prisma/client"

/**
 * Brand only shows corporate entities. Every read of CiEntity (directly or via a
 * campaign/SMS/subscription relation) must be scoped with these helpers.
 */

/** Prisma `where` fragment for CiEntity queries. */
export const CORPORATE_ENTITY_WHERE = { isCorporate: true } as const

/** Prisma `where` fragment for models with a nullable `entity` relation (campaigns, SMS, etc). */
export const CORPORATE_ENTITY_RELATION_WHERE = { entity: { isCorporate: true } } as const

/** Raw SQL fragment, for queries that alias CiEntity. Defaults to alias `e`. */
export function corporateEntitySql(alias = "e"): Prisma.Sql {
  return Prisma.raw(`"${alias}"."isCorporate" = true`)
}

/** Raw SQL string fragment for queries that build SQL as strings. */
export function corporateEntitySqlString(alias = "e"): string {
  return `${alias}."isCorporate" = true`
}
