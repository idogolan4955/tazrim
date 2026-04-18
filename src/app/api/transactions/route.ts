import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/api-guard";

export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;
  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("accountId") ?? undefined;
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const status = searchParams.get("status") ?? undefined;

  const where: Record<string, unknown> = {};
  if (accountId) where.accountId = accountId;
  if (status) where.status = status;
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, Date>).gte = new Date(from);
    if (to) (where.date as Record<string, Date>).lte = new Date(to);
  }

  const txns = await prisma.transaction.findMany({
    where,
    orderBy: { date: "desc" },
    take: 500,
  });
  return NextResponse.json(txns);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await req.json();
  const txn = await prisma.transaction.create({
    data: {
      accountId: body.accountId,
      date: new Date(body.date),
      amount: body.amount,
      kind: body.kind,
      description: body.description,
      category: body.category ?? null,
      status: body.status ?? "ACTUAL",
      source: body.source ?? "MANUAL",
    },
  });
  return NextResponse.json(txn);
}
