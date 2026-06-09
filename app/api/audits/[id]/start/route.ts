import { AuditStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db/prisma";
import { getEnv } from "@/src/lib/config/env";
import { logger } from "@/src/lib/logger/logger";
import { enqueueAuditProject } from "@/src/lib/queue/audit-queue";
import { rateLimit } from "@/src/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

    const queuedAudit = await prisma.auditProject.update({
      where: {
        id
      },
      data: {
        status: AuditStatus.QUEUED,
        errorMessage: null
      }
    });

    const job = await enqueueAuditProject(id);

    return NextResponse.json({
      auditProject: queuedAudit,
      jobId: job.id
    });
  } catch (error) {
    logger.error("Could not start audit project.", {
      error: error instanceof Error ? error.message : error
    });

    return NextResponse.json({ error: "Could not start audit project." }, { status: 500 });
  }
}
