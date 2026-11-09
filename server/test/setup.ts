import { afterAll } from 'vitest'
import { prisma } from '../src/db'

afterAll(() => prisma.$disconnect())
