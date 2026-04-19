import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-guard";
import { logAction } from "@/lib/audit";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const k of ["name", "amount", "kind", "frequency", "dayOfMonth", "category", "source", "sourceRefId", "active"]) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
  if (body.endDate !== undefined) data.endDate = body.endDate ? new Date(body.endDate) : null;
  const r = await prisma.recurringTransaction.update({ where: { id }, data });
  const activityNote = body.active !== undefined ? (r.active ? "הופעלה" : "הושהתה") : "עודכנה";
  await logAction({
    action: body.active !== undefined ? "STATUS_CHANGE" : "UPDATE",
    entity: "RECURRING",
    entityId: r.id,
    summary: `פעולה חוזרת ${activityNote}: ${r.name}`,
    amount: Number(r.amount),
    amountKind: r.kind === "INCOME" ? "INCOME" : "EXPENSE",
  });
  return NextResponse.json(r);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const existing = await prisma.recurringTransaction.findUnique({ where: { id } });
  await prisma.recurringTransaction.delete({ where: { id } });
  if (existing) {
    await logAction({
      action: "DELETE",
      entity: "RECURRING",
      entityId: id,
      summary: `נמחקה פעולה חוזרת: ${existing.name}`,
      amount: Number(existing.amount),
      amountKind: existing.kind === "INCOME" ? "INCOME" : "EXPENSE",
    });
  }
  return NextResponse.json({ ok: true });
}
