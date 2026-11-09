import { PrismaClient } from '@prisma/client'

/** Instancia única de Prisma para todo el servidor. */
export const prisma = new PrismaClient()
