import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/api-guard";
import { toNumber } from "@/lib/utils";
import { buildProjection } from "@/lib/projection";
import { getSettings } from "@/lib/settings";

export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const [loans, checks, receivables, settings] = await Promise.all([
    prisma.loan.findMany(),
    prisma.check.findMany({ where: { status: "PENDING" } }),
    prisma.receivable.findMany(),
    getSettings(["opening_inventory", "opening_inventory_date", "cogs_ratio"]),
  ]);

  const { byAccount } = await buildProjection({ horizonMonths: 12 });
  const currentTotal = byAccount.reduce((s, a) => s + a.current, 0);

  // Global inventory: use the stored opening as current inventory (a more sophisticated
  // computation is available in /api/balance-forecast for future-dated values).
  const totalInventory = parseFloat(settings.opening_inventory || "0");

  const totalLoans = loans.reduce((s, l) => s + toNumber(l.principal), 0);
  const postDatedReceivable = checks
    .filter((c) => c.kind === "RECEIVABLE_DEFERRED")
    .reduce((s, c) => s + toNumber(c.amount), 0);
  const discountedReceivable = checks
    .filter((c) => c.kind === "RECEIVABLE_DISCOUNTED")
    .reduce((s, c) => s + toNumber(c.amount), 0);
  const payableChecks = checks
    .filter((c) => c.kind === "PAYABLE")
    .reduce((s, c) => s + toNumber(c.amount), 0);
  const receivablesTotal = receivables.reduce((s, r) => s + toNumber(r.amount), 0);

  const assets = currentTotal + postDatedReceivable + totalInventory + receivablesTotal;
  const liabilities = totalLoans + payableChecks;
  const equity = assets - liabilities;

  return NextResponse.json({
    currentTotal,
    totalInventory,
    totalLoans,
    postDatedReceivable,
    discountedReceivable,
    payableChecks,
    receivablesTotal,
    assets,
    liabilities,
    equity,
  });
}
