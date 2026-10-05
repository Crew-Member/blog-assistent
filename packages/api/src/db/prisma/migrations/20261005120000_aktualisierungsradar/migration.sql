-- AlterTable
ALTER TABLE "Site" ADD COLUMN "radarEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "radarLastRunAt" TIMESTAMP(3),
ADD COLUMN "radarRunRequested" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "radarLastError" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "RadarFinding" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "wpPostId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL DEFAULT '',
    "publishedAt" TIMESTAMP(3),
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verdict" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "reasons" JSONB NOT NULL DEFAULT '[]',
    "sources" JSONB NOT NULL DEFAULT '[]',
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "revisionPostId" TEXT,

    CONSTRAINT "RadarFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RadarFinding_siteId_wpPostId_key" ON "RadarFinding"("siteId", "wpPostId");

-- AddForeignKey
ALTER TABLE "RadarFinding" ADD CONSTRAINT "RadarFinding_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "Site"("id") ON DELETE CASCADE ON UPDATE CASCADE;
