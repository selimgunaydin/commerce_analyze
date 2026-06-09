-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "reason" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorPage" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "pageType" TEXT NOT NULL,
    "title" TEXT,
    "metaDescription" TEXT,
    "screenshotPath" TEXT,
    "mobileScreenshotPath" TEXT,
    "domText" TEXT,
    "headings" JSONB,
    "links" JSONB,
    "buttons" JSONB,
    "forms" JSONB,
    "detectorResults" JSONB,
    "lighthouse" JSONB,
    "accessibility" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitorPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Competitor_projectId_idx" ON "Competitor"("projectId");

-- CreateIndex
CREATE INDEX "Competitor_normalizedUrl_idx" ON "Competitor"("normalizedUrl");

-- CreateIndex
CREATE INDEX "CompetitorPage_competitorId_idx" ON "CompetitorPage"("competitorId");

-- CreateIndex
CREATE INDEX "CompetitorPage_pageType_idx" ON "CompetitorPage"("pageType");

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "AuditProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorPage" ADD CONSTRAINT "CompetitorPage_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
