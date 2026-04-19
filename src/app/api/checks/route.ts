import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/api-guard";
import { logAction } from "@/lib/audit";

const KIND_LABEL: Record<string, string> = {
  RECEIVABLE_DEFERRED: "שיק דחוי מ־",
  RECEIVABLE_DISCOUNTED: "שיק נכיון מ־",
  PAYABLE: "שיק לפרעון ל־",
};

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId") ?? undefined;
  const kind = searchParams.get("kind") ?? undefined;
  const where: Record<string, unknown> = {};
  if (accountId) where.accountId = accountId;
  if (kind) where.kind = kind;
  const checks = await prisma.check.findMany({
    where,
    orderBy: { dueDate: "asc" },
    include: { account: { select: { id: true, name: true, color: true } } },
  });
  return NextResponse.json(checks);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await req.json();
  const c = await prisma.check.create({
    data: {
      accountId: body.accountId,
      kind: body.kind,
      amount: body.amount,
      dueDate: new Date(body.dueDate),
      discountedOn: body.discountedOn ? new Date(body.discountedOn) : null,
      counterparty: body.counterparty,
      reference: body.reference ?? null,
      status: body.status ?? "PENDING",
      purpose: body.purpose ?? null,
      notes: body.notes ?? null,
    },
  });
  const kindLabel = KIND_LABEL[c.kind] ?? "שיק ";
  await logAction({
    action: "CREATE",
    entity: "CHECK",
    entityId: c.id,
    summary: `${kindLabel}${c.counterparty}${c.reference ? ` #${c.reference}` : ""}`,
    amount: Number(c.amount),
    amountKind: c.kind === "PAYABLE" ? "EXPENSE" : "INCOME",
  });
  return NextResponse.json(c);
}
