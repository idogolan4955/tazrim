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
  for (const k of ["amount", "kind", "description", "category", "status", "source"]) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  if (body.date !== undefined) data.date = new Date(body.date);
  const t = await prisma.transaction.update({ where: { id }, data });
  await logAction({
    action: "UPDATE",
    entity: "TRANSACTION",
    entityId: t.id,
    summary: `עודכנה תנועה: ${t.description}`,
    amount: Number(t.amount),
    amountKind: t.kind === "INCOME" ? "INCOME" : "EXPENSE",
  });
  return NextResponse.json(t);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const existing = await prisma.transaction.findUnique({ where: { id } });
  await prisma.transaction.delete({ where: { id } });
  if (existing) {
    await logAction({
      action: "DELETE",
      entity: "TRANSACTION",
      entityId: id,
      summary: `נמחקה תנועה: ${existing.description}`,
      amount: Number(existing.amount),
      amountKind: existing.kind === "INCOME" ? "INCOME" : "EXPENSE",
    });
  }
  return NextResponse.json({ ok: true });
}
