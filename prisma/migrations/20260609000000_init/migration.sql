-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('QUEUED', 'CRAWLING', 'AUDITING', 'COMPETITOR_ANALYSIS', 'AI_ANALYSIS', 'REPORT_READY', 'FAILED');

-- CreateEnum
CREATE TYPE "AuditDepth" AS ENUM ('QUICK', 'STANDARD', 'DEEP');

-- CreateTable
CREATE TABLE "AuditProject" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "brandName" TEXT,
    "industry" TEXT,
    "country" TEXT,
    "depth" "AuditDepth" NOT NULL DEFAULT 'STANDARD',
    "status" "AuditStatus" NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuditProject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditProject_status_idx" ON "AuditProject"("status");

-- CreateIndex
CREATE INDEX "AuditProject_createdAt_idx" ON "AuditProject"("createdAt");
