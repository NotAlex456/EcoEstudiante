-- Etapa 6: categoría libre, roles, sesiones revocables, bloqueo, recuperación de contraseña y moderación.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('student', 'admin');

-- CreateEnum
CREATE TYPE "CodePurpose" AS ENUM ('verify', 'reset');

-- CreateEnum
CREATE TYPE "ModerationAction" AS ENUM ('hide_material', 'restore_material', 'delete_material', 'block_user', 'unblock_user', 'dismiss_report');

-- AlterTable
ALTER TABLE "EmailCode" ADD COLUMN     "purpose" "CodePurpose" NOT NULL DEFAULT 'verify';

-- AlterTable
ALTER TABLE "Material" ADD COLUMN     "moderatedAt" TIMESTAMP(3);

-- La categoría pasa de enum a texto libre, conservando los valores actuales.
ALTER TABLE "Material" ALTER COLUMN "category" TYPE TEXT USING "category"::text;

-- AlterTable
ALTER TABLE "Report" ADD COLUMN     "resolution" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'student',
ADD COLUMN     "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- DropEnum
DROP TYPE "Category";

-- CreateTable
CREATE TABLE "ModerationLog" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" "ModerationAction" NOT NULL,
    "targetId" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModerationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ModerationLog_createdAt_idx" ON "ModerationLog"("createdAt");

-- CreateIndex
CREATE INDEX "Material_category_idx" ON "Material"("category");

-- AddForeignKey
ALTER TABLE "ModerationLog" ADD CONSTRAINT "ModerationLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carreras de la filial Chincha: "Administración" pasa a "Administración de Empresas".
UPDATE "User" SET "career" = 'Administración de Empresas' WHERE "career" = 'Administración';
UPDATE "Material" SET "career" = 'Administración de Empresas' WHERE "career" = 'Administración';
