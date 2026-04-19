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
  for (const k of ["customerName", "amount", "notes"]) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  const r = await prisma.receivable.update({ where: { id }, data });
  await logAction({
    action: "UPDATE",
    entity: "RECEIVABLE",
    entityId: r.id,
    summary: `עודכן לקוח בכרטסת: ${r.customerName}`,
    amount: Number(r.amount),
    amountKind: "NEUTRAL",
  });
  return NextResponse.json(r);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const existing = await prisma.receivable.findUnique({ where: { id } });
  await prisma.receivable.delete({ where: { id } });
  if (existing) {
    await logAction({
      action: "DELETE",
      entity: "RECEIVABLE",
      entityId: id,
      summary: `הוסר מכרטסת: ${existing.customerName}`,
      amount: Number(existing.amount),
      amountKind: "NEUTRAL",
    });
  }
  return NextResponse.json({ ok: true });
}
