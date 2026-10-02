-- AlterEnum
ALTER TYPE "PostStatus" ADD VALUE 'FACTCHECKING';

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "factCheck" JSONB;

-- CreateTable
CREATE TABLE "StyleSample" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StyleSample_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "StyleSample" ADD CONSTRAINT "StyleSample_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
