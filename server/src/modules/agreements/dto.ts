import type { Agreement, AgreementStatus, Review } from '@prisma/client'

export type AgreementDto = {
  id: string
  materialId: string
  buyerId: string
  sellerId: string
  place: string
  date: string
  time: string
  note?: string
  status: AgreementStatus
  createdAt: string
  updatedAt: string
  review: { stars: number; comment: string; createdAt: string } | null
}

export const toAgreementDto = (a: Agreement & { review: Review | null }): AgreementDto => ({
  id: a.id,
  materialId: a.materialId,
  buyerId: a.buyerId,
  sellerId: a.sellerId,
  place: a.place,
  date: a.date,
  time: a.time,
  ...(a.note ? { note: a.note } : {}),
  status: a.status,
  createdAt: a.createdAt.toISOString(),
  updatedAt: a.updatedAt.toISOString(),
  review: a.review ? { stars: a.review.stars, comment: a.review.comment, createdAt: a.review.createdAt.toISOString() } : null,
})
