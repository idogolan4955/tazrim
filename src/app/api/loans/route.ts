import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/lib/api-guard";
import { spitzerSchedule, monthlyPayment } from "@/lib/spitzer";
import { toNumber } from "@/lib/utils";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;
  const loans = await prisma.loan.findMany({
    orderBy: { createdAt: "desc" },
    include: { account: { select: { id: true, name: true, color: true } } },
  });
  const boiRow = await prisma.setting.findUnique({ where: { key: "boi_base_rate" } });
  const boi = boiRow ? parseFloat(boiRow.value) : parseFloat(process.env.BOI_BASE_RATE_FALLBACK ?? "4.5");
  const prime = boi + 1.5;
  const enriched = loans.map((l) => {
    const rate = l.type === "FIXED" ? toNumber(l.fixedRate) : prime + toNumber(l.spread);
    const pay = monthlyPayment(toNumber(l.principal), rate, l.termMonths);
    return { ...l, effectiveRate: rate, monthlyPayment: Math.round(pay * 100) / 100 };
  });
  return NextResponse.json({ loans: enriched, boi, prime });
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;
  const body = await req.json();
  const loan = await prisma.loan.create({
    data: {
      accountId: body.accountId,
      name: body.name,
      principal: body.principal,
      type: body.type ?? "PRIME_LINKED",
      spread: body.spread ?? 0,
      fixedRate: body.fixedRate ?? null,
      startDate: new Date(body.startDate),
      termMonths: body.termMonths,
    },
  });

  // Auto-create a recurring expense representing the monthly payment (reference only; projection computes from schedule).
  const boiRow = await prisma.setting.findUnique({ where: { key: "boi_base_rate" } });
  const boi = boiRow ? parseFloat(boiRow.value) : parseFloat(process.env.BOI_BASE_RATE_FALLBACK ?? "4.5");
  const rate = loan.type === "FIXED" ? toNumber(loan.fixedRate) : boi + 1.5 + toNumber(loan.spread);
  const pay = monthlyPayment(toNumber(loan.principal), rate, loan.termMonths);
  const start = new Date(loan.startDate);
  start.setMonth(start.getMonth() + 1);
  const endDate = new Date(loan.startDate);
  endDate.setMonth(endDate.getMonth() + loan.termMonths);

  await prisma.recurringTransaction.create({
    data: {
      accountId: loan.accountId,
      name: `החזר הלוואה: ${loan.name}`,
      amount: Math.round(pay * 100) / 100,
      kind: "EXPENSE",
      frequency: "MONTHLY",
      dayOfMonth: start.getDate(),
      startDate: start,
      endDate,
      category: "הלוואות",
      source: "LOAN",
      sourceRefId: loan.id,
      active: true,
    },
  });

  return NextResponse.json(loan);
}
