import { AuditDepth } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/src/lib/db/prisma";
import { getEnv } from "@/src/lib/config/env";
import { rateLimit } from "@/src/lib/security/rate-limit";
import {
  ManualCompetitorInputError,
  ManualCompetitorProvider,
  parseManualCompetitorInput
} from "@/src/lib/audit/manual-competitor-provider";
import { UrlValidationError, validateAndNormalizeUrl } from "@/src/lib/utils/url-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createAuditSchema = z.object({
  url: z.string().min(1),
  brandName: z.string().trim().min(1).max(120).optional().or(z.literal("")),
  industry: z.string().trim().min(1).max(120).optional().or(z.literal("")),
  country: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  competitorUrls: z.string().max(2_000).optional().or(z.literal("")),
  depth: z.nativeEnum(AuditDepth).default(AuditDepth.STANDARD)
});

export async function POST(request: Request) {
  try {
    const rateLimitResponse = rateLimit(request, {
      keyPrefix: "audit-create",
      maxRequests: getEnv().AUDIT_CREATE_RATE_LIMIT_MAX
    });

    if (rateLimitResponse) {
      return rateLimitResponse;
    }

    const payload = createAuditSchema.parse(await request.json());
    const validatedUrl = await validateAndNormalizeUrl(payload.url);
    const competitorProvider = new ManualCompetitorProvider();
    const competitorCandidates = await competitorProvider.discover({
      projectUrl: validatedUrl.normalizedUrl,
      brandName: emptyToNull(payload.brandName),
      industry: emptyToNull(payload.industry),
      country: emptyToNull(payload.country),
      manualCompetitors: parseManualCompetitorInput(payload.competitorUrls ?? "")
    });

    const auditProject = await prisma.auditProject.create({
      data: {
        url: validatedUrl.normalizedUrl,
        normalizedUrl: validatedUrl.normalizedUrl,
        brandName: emptyToNull(payload.brandName),
        industry: emptyToNull(payload.industry),
        country: emptyToNull(payload.country),
        depth: payload.depth,
        competitors: {
          create: competitorCandidates.map((competitor) => ({
            name: competitor.name,
            url: competitor.url,
            normalizedUrl: competitor.url,
            confidence: competitor.confidence,
            reason: competitor.reason
          }))
        }
      },
      include: {
        competitors: true
      }
    });

    return NextResponse.json(auditProject, { status: 201 });
  } catch (error) {
    if (error instanceof UrlValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof ManualCompetitorInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request payload.", details: error.flatten() }, { status: 400 });
    }

    return NextResponse.json({ error: "Could not create audit project." }, { status: 500 });
  }
}

export async function GET() {
  const audits = await prisma.auditProject.findMany({
    orderBy: {
      createdAt: "desc"
    },
    take: 50
  });

  return NextResponse.json(audits);
}

function emptyToNull(value?: string) {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
