import { NextResponse } from "next/server";
import { prisma } from "@/src/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const auditProject = await prisma.auditProject.findUnique({
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
      }
    }
  });

  if (!auditProject) {
    return NextResponse.json({ error: "Audit project not found." }, { status: 404 });
  }

  return NextResponse.json(auditProject);
}
