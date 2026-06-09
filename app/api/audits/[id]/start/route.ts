import { AuditStatus } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db/prisma";
import { getEnv } from "@/src/lib/config/env";
import { logger } from "@/src/lib/logger/logger";
import { enqueueAuditProject } from "@/src/lib/queue/audit-queue";
import { rateLimit } from "@/src/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const activeStatuses = new Set<AuditStatus>([
  AuditStatus.QUEUED,
  AuditStatus.CRAWLING,
  AuditStatus.AUDITING,
  AuditStatus.COMPETITOR_ANALYSIS,
  AuditStatus.AI_ANALYSIS
]);

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const rateLimitResponse = rateLimit(request, {
      keyPrefix: "audit-start",
      maxRequests: getEnv().AUDIT_START_RATE_LIMIT_MAX
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const { id } = await context.params;
    const auditProject = await prisma.auditProject.findUnique({
      where: {
        id
      }
    });

    if (!auditProject) {
      return NextResponse.json({ error: "Audit project not found." }, { status: 404 });
    }

    if (activeStatuses.has(auditProject.status) && auditProject.activeRunId) {
      return NextResponse.json(
        {
          error: "Bu audit zaten çalışıyor. Yeni bir çalışma başlatmadan önce mevcut işlem bitmeli.",
          status: auditProject.status
        },
        { status: 409 }
      );
    }

    const runId = randomUUID();
    const queuedAudit = await prisma.auditProject.update({
      where: {
        id
      },
      data: {
        status: AuditStatus.QUEUED,
        errorMessage: null,
        activeRunId: runId
      }
    });

    const job = await enqueueAuditProject(id, runId);

    return NextResponse.json({
      auditProject: queuedAudit,
      runId,
      jobId: job.id
    });
  } catch (error) {
    logger.error("Could not start audit project.", {
      error: error instanceof Error ? error.message : error
    });

    return NextResponse.json({ error: "Could not start audit project." }, { status: 500 });
  }
}
