ALTER TABLE "AuditProject" ADD COLUMN "activeRunId" TEXT;

CREATE INDEX "AuditProject_activeRunId_idx" ON "AuditProject"("activeRunId");
