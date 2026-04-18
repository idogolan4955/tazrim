import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-guard";

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
  if (body.inventory !== undefined) data.inventory = body.inventory;
  if (body.notes !== undefined) data.notes = body.notes;
  const acc = await prisma.account.update({ where: { id }, data });
  return NextResponse.json(acc);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  await prisma.account.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
