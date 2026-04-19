import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/api-guard";
import { logAction } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId") ?? undefined;
  const items = await prisma.recurringTransaction.findMany({
    where: accountId ? { accountId } : undefined,
    orderBy: { createdAt: "desc" },
    include: { account: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await req.json();
  const r = await prisma.recurringTransaction.create({
    data: {
      accountId: body.accountId,
      name: body.name,
      amount: body.amount,
      kind: body.kind,
      frequency: body.frequency ?? "MONTHLY",
      dayOfMonth: body.dayOfMonth ?? null,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : null,
      category: body.category ?? null,
      source: body.source ?? "MANUAL",
      sourceRefId: body.sourceRefId ?? null,
      active: body.active ?? true,
    },
  });
  await logAction({
    action: "CREATE",
    entity: "RECURRING",
    entityId: r.id,
    summary: `נוצרה פעולה חוזרת: ${r.name}`,
    amount: Number(r.amount),
    amountKind: r.kind === "INCOME" ? "INCOME" : "EXPENSE",
  });
  return NextResponse.json(r);
}
