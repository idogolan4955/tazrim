import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/api-guard";
import { logAction } from "@/lib/audit";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const items = await prisma.receivable.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await req.json();
  const r = await prisma.receivable.create({
    data: {
      customerName: body.customerName,
      amount: body.amount,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      notes: body.notes ?? null,
    },
  });
  await logAction({
    action: "CREATE",
    entity: "RECEIVABLE",
    entityId: r.id,
    summary: `נוסף לכרטסת: ${r.customerName}`,
    amount: Number(r.amount),
    amountKind: "INCOME",
  });
  return NextResponse.json(r);
}
