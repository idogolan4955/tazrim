import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-guard";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  for (const k of ["kind", "accountId", "amount", "counterparty", "reference", "status", "purpose", "notes"]) {
    if (body[k] !== undefined) data[k] = body[k];
  }
  if (body.dueDate !== undefined) data.dueDate = new Date(body.dueDate);
  if (body.discountedOn !== undefined) data.discountedOn = body.discountedOn ? new Date(body.discountedOn) : null;
  const c = await prisma.check.update({ where: { id }, data });
  return NextResponse.json(c);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdmin();
  if (error) return error;
  const { id } = await params;
  await prisma.check.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
