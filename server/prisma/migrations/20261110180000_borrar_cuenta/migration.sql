-- Eliminar mi cuenta: datos reales solo para el panel y registro en moderación.
ALTER TYPE "ModerationAction" ADD VALUE 'delete_account';

ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedEmail" TEXT,
ADD COLUMN "deletedName" TEXT;
