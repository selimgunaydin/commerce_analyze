import { notFound } from "next/navigation";
import { AuditDetailView } from "@/src/components/audit-detail/audit-detail-view";
import { activeAuditStatuses } from "@/src/lib/audit/detail-view-model";
import { prisma } from "@/src/lib/db/prisma";
import { CancelAuditButton, StartAuditButton } from "./start-audit-button";

export const dynamic = "force-dynamic";

type AuditDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function AuditDetailPage({ params }: AuditDetailPageProps) {
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
      reports: {
        orderBy: {
          createdAt: "desc"
        },
        take: 1
      },
      opportunities: {
        orderBy: {
          createdAt: "asc"
        }
      }
    }
  });

  if (!audit) {
    notFound();
  }

  const isRunning = activeAuditStatuses.has(audit.status) && Boolean(audit.activeRunId);
  const actions = (
    <>
      <StartAuditButton auditId={audit.id} isRunning={isRunning} />
      {isRunning ? <CancelAuditButton auditId={audit.id} /> : null}
    </>
  );

  return <AuditDetailView audit={audit} actions={actions} />;
}
