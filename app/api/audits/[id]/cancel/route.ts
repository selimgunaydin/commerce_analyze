import { AuditStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db/prisma";
import { getEnv } from "@/src/lib/config/env";
import { logger } from "@/src/lib/logger/logger";
import { cancelQueuedAuditProject } from "@/src/lib/queue/audit-queue";
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
      keyPrefix: "audit-cancel",
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

    if (!activeStatuses.has(auditProject.status)) {
      return NextResponse.json(
        {
          error: "Bu audit şu anda çalışmıyor.",
          status: auditProject.status
        },
        { status: 409 }
      );
    }

    const runId = auditProject.activeRunId;
    const update = await prisma.auditProject.updateMany({
      where: {
        id,
        ...(runId ? { activeRunId: runId } : {})
      },
      data: {
        status: AuditStatus.CANCELED,
        activeRunId: null,
        errorMessage: null
      }
    });

    if (update.count === 0) {
      return NextResponse.json(
        {
          error: "Audit durumu değiştiği için iptal uygulanamadı."
        },
        { status: 409 }
      );
    }

    const removedQueuedJob = runId ? await cancelQueuedAuditProject(id, runId) : false;
    const canceledAudit = await prisma.auditProject.findUnique({
      where: {
        id
      }
    });

    logger.info("Audit cancellation requested.", {
      auditProjectId: id,
      runId,
      removedQueuedJob
    });

    return NextResponse.json({
      auditProject: canceledAudit,
      runId,
      removedQueuedJob
    });
  } catch (error) {
    logger.error("Could not cancel audit project.", {
      error: error instanceof Error ? error.message : error
    });

    return NextResponse.json({ error: "Could not cancel audit project." }, { status: 500 });
  }
}
