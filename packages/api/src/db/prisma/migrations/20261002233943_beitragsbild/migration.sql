-- CreateEnum
CREATE TYPE "ImageStatus" AS ENUM ('PLANNED', 'QUEUED', 'GENERATING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "ImageOrigin" AS ENUM ('AI', 'UPLOAD');

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "labelAiImages" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PostImage" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "status" "ImageStatus" NOT NULL DEFAULT 'PLANNED',
    "origin" "ImageOrigin" NOT NULL DEFAULT 'AI',
    "aiGenerated" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "style" TEXT NOT NULL DEFAULT 'illustration',
    "prompt" TEXT NOT NULL DEFAULT '',
    "altText" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "searchQuery" TEXT NOT NULL DEFAULT '',
    "sourceNote" TEXT NOT NULL DEFAULT '',
    "storageKey" TEXT,
    "mimeType" TEXT,
    "wpMediaId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostImage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PostImage_postId_key" ON "PostImage"("postId");

-- AddForeignKey
ALTER TABLE "PostImage" ADD CONSTRAINT "PostImage_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
