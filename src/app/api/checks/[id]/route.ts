import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-guard";
import { logAction } from "@/lib/audit";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "ממתין",
  CLEARED: "נפרע",
  BOUNCED: "חזר",
  CANCELLED: "בוטל",
};

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const before = await prisma.check.findUnique({ where: { id } });
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const k of ["kind", "accountId", "amount", "counterparty", "reference", "status", "purpose", "notes"]) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  if (body.dueDate !== undefined) data.dueDate = new Date(body.dueDate);
  if (body.discountedOn !== undefined) data.discountedOn = body.discountedOn ? new Date(body.discountedOn) : null;
  const c = await prisma.check.update({ where: { id }, data });

  // Figure out what kind of change this was to produce a useful log line.
  if (before && body.kind === "RECEIVABLE_DISCOUNTED" && before.kind === "RECEIVABLE_DEFERRED") {
    await logAction({
      action: "CONVERT",
      entity: "CHECK",
      entityId: c.id,
      summary: `שיק של ${c.counterparty} הועבר לנכיון${body.purpose ? ` · מטרה: ${body.purpose}` : ""}`,
      amount: Number(c.amount),
      amountKind: "INCOME",
    });
  } else if (before && body.kind === "RECEIVABLE_DEFERRED" && before.kind === "RECEIVABLE_DISCOUNTED") {
    await logAction({
      action: "CONVERT",
      entity: "CHECK",
      entityId: c.id,
      summary: `בוטל נכיון — שיק של ${c.counterparty} חזר להיות דחוי רגיל`,
      amount: Number(c.amount),
      amountKind: "NEUTRAL",
    });
  } else if (body.status !== undefined && before && before.status !== body.status) {
    await logAction({
      action: "STATUS_CHANGE",
      entity: "CHECK",
      entityId: c.id,
      summary: `סטטוס שיק של ${c.counterparty} שונה ל-${STATUS_LABEL[body.status] ?? body.status}`,
      amount: Number(c.amount),
      amountKind: body.status === "BOUNCED" || body.status === "CANCELLED" ? "EXPENSE" : "NEUTRAL",
    });
  } else {
    await logAction({
      action: "UPDATE",
      entity: "CHECK",
      entityId: c.id,
      summary: `עודכן שיק של ${c.counterparty}`,
      amount: Number(c.amount),
      amountKind: c.kind === "PAYABLE" ? "EXPENSE" : "INCOME",
    });
  }

  return NextResponse.json(c);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const existing = await prisma.check.findUnique({ where: { id } });
  await prisma.check.delete({ where: { id } });
  if (existing) {
    await logAction({
      action: "DELETE",
      entity: "CHECK",
      entityId: id,
      summary: `נמחק שיק של ${existing.counterparty}`,
      amount: Number(existing.amount),
      amountKind: existing.kind === "PAYABLE" ? "EXPENSE" : "INCOME",
    });
  }
  return NextResponse.json({ ok: true });
}
