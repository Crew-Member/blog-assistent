-- AlterTable
ALTER TABLE "Site" ADD COLUMN "structureSummary" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "structureFaq" BOOLEAN NOT NULL DEFAULT true;
