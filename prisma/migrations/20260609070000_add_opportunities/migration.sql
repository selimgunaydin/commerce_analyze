-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "priority" TEXT NOT NULL,
    "estimatedEffort" TEXT NOT NULL,
    "expectedImpact" TEXT NOT NULL,
    "implementationComplexity" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,
    "affectedPages" JSONB NOT NULL,
    "acceptanceCriteria" JSONB NOT NULL,
    "relatedCompetitorExamples" JSONB,
    "suggestedImplementation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Opportunity_projectId_idx" ON "Opportunity"("projectId");

-- CreateIndex
CREATE INDEX "Opportunity_priority_idx" ON "Opportunity"("priority");

-- CreateIndex
CREATE INDEX "Opportunity_category_idx" ON "Opportunity"("category");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "AuditProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
