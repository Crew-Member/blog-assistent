-- AlterTable
ALTER TABLE "Site" ADD COLUMN "portfolio" TEXT NOT NULL DEFAULT '',
ADD COLUMN "scoutEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "scoutLastRunAt" TIMESTAMP(3),
ADD COLUMN "scoutRunRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "scoutLastError" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "TopicIdea" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "keyword" TEXT NOT NULL DEFAULT '',
    "area" TEXT NOT NULL DEFAULT '',
    "urgency" TEXT NOT NULL DEFAULT 'medium',
    "whyNow" TEXT NOT NULL DEFAULT '',
    "angle" TEXT NOT NULL DEFAULT '',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "postId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TopicIdea_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "TopicIdea" ADD CONSTRAINT "TopicIdea_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
