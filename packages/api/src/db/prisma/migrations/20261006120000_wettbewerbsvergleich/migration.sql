-- AlterTable
ALTER TABLE "Site" ADD COLUMN "competitionCheck" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "competition" JSONB;
