import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/api-guard";
import { logAction } from "@/lib/audit";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const accounts = await prisma.account.findMany({ orderBy: { createdAt: "asc" } });
  return NextResponse.json(accounts);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await req.json();
  const account = await prisma.account.create({
    data: {
      name: body.name,
      bankName: body.bankName ?? null,
      accountNumber: body.accountNumber ?? null,
      color: body.color ?? "#336bff",
      openingBalance: body.openingBalance ?? 0,
      openingBalanceDate: body.openingBalanceDate ? new Date(body.openingBalanceDate) : new Date(),
      notes: body.notes ?? null,
    },
  });
  await logAction({
    action: "CREATE",
    entity: "ACCOUNT",
    entityId: account.id,
    summary: `נוצר חשבון חדש "${account.name}"${account.bankName ? ` (${account.bankName})` : ""}`,
    amount: Number(account.openingBalance),
    amountKind: "NEUTRAL",
  });
  return NextResponse.json(account);
}
