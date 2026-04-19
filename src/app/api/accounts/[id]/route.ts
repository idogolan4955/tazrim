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
  if (body.name !== undefined) data.name = body.name;
  if (body.bankName !== undefined) data.bankName = body.bankName;
  if (body.accountNumber !== undefined) data.accountNumber = body.accountNumber;
  if (body.color !== undefined) data.color = body.color;
  if (body.openingBalance !== undefined) data.openingBalance = body.openingBalance;
  if (body.openingBalanceDate !== undefined) data.openingBalanceDate = new Date(body.openingBalanceDate);
  if (body.notes !== undefined) data.notes = body.notes;
  const acc = await prisma.account.update({ where: { id }, data });

  const changes: string[] = [];
  if (body.openingBalance !== undefined) changes.push("יתרת פתיחה");
  if (body.openingBalanceDate !== undefined) changes.push("תאריך יתרה");
  if (body.name !== undefined) changes.push("שם");
  if (body.bankName !== undefined) changes.push("בנק");
  if (body.accountNumber !== undefined) changes.push("מספר");
  if (body.color !== undefined) changes.push("צבע");
  if (body.notes !== undefined) changes.push("הערות");

  await logAction({
    action: "UPDATE",
    entity: "ACCOUNT",
    entityId: acc.id,
    summary: `עודכן חשבון "${acc.name}"${changes.length ? ` — ${changes.join(", ")}` : ""}`,
    amount: body.openingBalance !== undefined ? Number(body.openingBalance) : null,
    amountKind: body.openingBalance !== undefined ? "NEUTRAL" : null,
  });
  return NextResponse.json(acc);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const acc = await prisma.account.findUnique({ where: { id } });
  await prisma.account.delete({ where: { id } });
  if (acc) {
    await logAction({
      action: "DELETE",
      entity: "ACCOUNT",
      entityId: id,
      summary: `נמחק חשבון "${acc.name}" וכל התנועות, ההלוואות והשיקים המשויכים`,
    });
  }
  return NextResponse.json({ ok: true });
}
