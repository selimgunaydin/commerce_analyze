-- CreateTable
CREATE TABLE "AuditPage" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
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
    "consoleErrors" JSONB,
    "failedRequests" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditPage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditPage_projectId_idx" ON "AuditPage"("projectId");

-- CreateIndex
CREATE INDEX "AuditPage_pageType_idx" ON "AuditPage"("pageType");

-- AddForeignKey
ALTER TABLE "AuditPage" ADD CONSTRAINT "AuditPage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "AuditProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
