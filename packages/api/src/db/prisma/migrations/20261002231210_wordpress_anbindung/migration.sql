-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "wpCategoryIds" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "wpEditUrl" TEXT,
ADD COLUMN     "wpLink" TEXT,
ADD COLUMN     "wpPostId" INTEGER,
ADD COLUMN     "wpPushedAt" TIMESTAMP(3),
ADD COLUMN     "wpSeo" JSONB;

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "wpAppPassword" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "wpUsername" TEXT NOT NULL DEFAULT '';
