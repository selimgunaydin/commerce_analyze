import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { finalAuditReportSchema, type CompetitorComparison } from "@/src/lib/ai/schemas";
import { prisma } from "@/src/lib/db/prisma";
import { AuditReportView } from "@/src/components/report/report-page";
import { buildFinalAuditReportDraft, buildMarkdownReport } from "@/src/lib/report/report-builder";

export const dynamic = "force-dynamic";

type AuditReportPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AuditReportPage({ params }: AuditReportPageProps) {
  const { id } = await params;
  const audit = await prisma.auditProject.findUnique({
    where: {
      id
    },
    include: {
      pages: {
        orderBy: {
          createdAt: "asc"
        }
      },
      competitors: {
        include: {
          pages: {
            orderBy: {
              createdAt: "asc"
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      },
      opportunities: {
        orderBy: {
          createdAt: "asc"
        }
      },
      reports: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      }
    }
  });

  if (!audit) {
    notFound();
  }

  const report = audit.reports[0] ?? null;

  if (!report) {
    notFound();
  }

  const finalReport = getFinalReport(report.content) ?? buildFinalAuditReportDraft({ project: audit, report });
  const markdown = report.markdown ?? buildMarkdownReport(finalReport);
  const competitorComparison = getCompetitorComparison(report.content);

  return (
    <div className="space-y-6">
      <div className="border-b border-line pb-5">
        <Link href={`/audits/${audit.id}`} className="inline-flex items-center gap-2 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft aria-hidden="true" size={16} />
          Audit details
        </Link>
        <h1 className="mt-4 text-2xl font-semibold text-ink">{audit.brandName ?? audit.normalizedUrl}</h1>
        <p className="mt-1 break-all text-sm text-muted">{audit.normalizedUrl}</p>
      </div>

      <AuditReportView
        competitorComparison={competitorComparison}
        finalReport={finalReport}
        markdown={markdown}
        pages={audit.pages}
      />
    </div>
  );
}

function getFinalReport(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const content = value as Record<string, unknown>;
  const parsed = finalAuditReportSchema.safeParse(content.finalReport);

  return parsed.success ? parsed.data : null;
}

function getCompetitorComparison(value: unknown): CompetitorComparison | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const content = value as Record<string, unknown>;
  const comparison = content.competitorComparison;

  if (!comparison || typeof comparison !== "object" || Array.isArray(comparison)) {
    return null;
  }

  return comparison as CompetitorComparison;
}
