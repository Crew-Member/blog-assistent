-- AlterTable
ALTER TABLE "Site" ADD COLUMN "scoutFocus" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "TopicIdea" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'scout';
