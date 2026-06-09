-- CreateTable
CREATE TABLE "AuditReport" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "executiveSummary" TEXT,
    "scorecard" JSONB,
    "content" JSONB,
    "markdown" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditReport_projectId_idx" ON "AuditReport"("projectId");

-- CreateIndex
CREATE INDEX "AuditReport_createdAt_idx" ON "AuditReport"("createdAt");

-- AddForeignKey
ALTER TABLE "AuditReport" ADD CONSTRAINT "AuditReport_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "AuditProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
