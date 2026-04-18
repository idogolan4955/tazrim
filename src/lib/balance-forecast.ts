import { prisma } from "./prisma";
import { buildProjection } from "./projection";
import { spitzerSchedule } from "./spitzer";
import { getSettings } from "./settings";
import { toNumber } from "./utils";

export interface BalancePoint {
  month: string; // YYYY-MM
  cash: number;
  inventory: number;
  receivableChecks: number;
  receivablesLedger: number;
  assets: number;
  loans: number;
  payableChecks: number;
  liabilities: number;
  equity: number;
}

export async function buildBalanceForecast(horizonMonths = 12): Promise<BalancePoint[]> {
  const asOf = new Date();
  asOf.setHours(0, 0, 0, 0);

  const [projection, loans, checks, receivables, sales, settings] = await Promise.all([
    buildProjection({ horizonMonths }),
    prisma.loan.findMany(),
    prisma.check.findMany({ where: { status: "PENDING" } }),
    prisma.receivable.findMany(),
    prisma.monthlySales.findMany(),
    getSettings(["opening_inventory", "opening_inventory_date", "cogs_ratio"]),
  ]);

  const prime = await getPrimeRate();
  const inventoryOpening = parseFloat(settings.opening_inventory || "0");
  const inventoryDate = parseDateSafe(settings.opening_inventory_date) ?? asOf;
  const cogsRatio = parseFloat(settings.cogs_ratio || "0.35");

  const receivablesLedgerTotal = receivables.reduce((s, r) => s + toNumber(r.amount), 0);

  const points: BalancePoint[] = [];
  for (let i = 0; i <= horizonMonths; i++) {
    const monthDate = new Date(asOf);
    monthDate.setMonth(monthDate.getMonth() + i);
    const endOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    endOfMonth.setHours(0, 0, 0, 0);
    const monthKey = `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`;

    // Cash: last point in daily series ≤ endOfMonth
    const endKey = dateKey(endOfMonth);
    const cash = lastBalanceAtOrBefore(projection.combined.series, endKey);

    // Inventory: opening + Σ(purchase - COGS) for each month from inventoryDate .. endOfMonth
    // Prefer actualPurchase if set, otherwise use planned (base × purchaseRatio).
    let inventory = inventoryOpening;
    for (const s of sales) {
      const sMonthEnd = endOfMonthForYM(s.month);
      if (sMonthEnd < inventoryDate) continue;
      if (sMonthEnd > endOfMonth) continue;
      const base = toNumber(s.salesAmount) || toNumber(s.forecastAmount);
      if (base <= 0 && toNumber(s.actualPurchase) <= 0) continue;
      const planned = base * toNumber(s.purchaseRatio);
      const purchase = toNumber(s.actualPurchase) > 0 ? toNumber(s.actualPurchase) : planned;
      const cogs = base * cogsRatio;
      inventory += purchase - cogs;
    }

    // Receivable checks: PENDING RECEIVABLE_DEFERRED with dueDate > endOfMonth (still outstanding)
    // Plus RECEIVABLE_DISCOUNTED not yet cleared by endOfMonth? Discounted are reflected in cash already.
    const receivableChecks = checks
      .filter((c) => c.kind === "RECEIVABLE_DEFERRED" && new Date(c.dueDate) > endOfMonth)
      .reduce((s, c) => s + toNumber(c.amount), 0);

    // Payable checks: PENDING PAYABLE with dueDate > endOfMonth
    const payableChecks = checks
      .filter((c) => c.kind === "PAYABLE" && new Date(c.dueDate) > endOfMonth)
      .reduce((s, c) => s + toNumber(c.amount), 0);

    // Loans balance at endOfMonth
    let loansBalance = 0;
    for (const l of loans) {
      const rate = resolveLoanRateSync(l, prime);
      const basis = toNumber(l.currentBalance) > 0 ? toNumber(l.currentBalance) : toNumber(l.principal);
      const schedule = spitzerSchedule({
        principal: basis,
        annualRatePct: rate,
        termMonths: l.termMonths,
        startDate: new Date(l.startDate),
      });
      let rem = basis;
      for (const row of schedule) {
        if (row.paymentDate <= endOfMonth) rem = row.balance;
        else break;
      }
      loansBalance += rem;
    }

    const assets = cash + inventory + receivableChecks + receivablesLedgerTotal;
    const liabilities = loansBalance + payableChecks;
    const equity = assets - liabilities;

    points.push({
      month: monthKey,
      cash: round2(cash),
      inventory: round2(inventory),
      receivableChecks: round2(receivableChecks),
      receivablesLedger: round2(receivablesLedgerTotal),
      assets: round2(assets),
      loans: round2(loansBalance),
      payableChecks: round2(payableChecks),
      liabilities: round2(liabilities),
      equity: round2(equity),
    });
  }

  return points;
}

async function getPrimeRate(): Promise<number> {
  const row = await prisma.setting.findUnique({ where: { key: "boi_base_rate" } });
  const boi = row ? parseFloat(row.value) : parseFloat(process.env.BOI_BASE_RATE_FALLBACK ?? "4.5");
  return boi + 1.5;
}

function resolveLoanRateSync(loan: { type: "FIXED" | "PRIME_LINKED"; spread: unknown; fixedRate: unknown | null }, prime: number): number {
  if (loan.type === "FIXED") return toNumber(loan.fixedRate);
  return prime + toNumber(loan.spread);
}

function endOfMonthForYM(ym: string): Date {
  const [y, m] = ym.split("-").map((n) => parseInt(n, 10));
  const d = new Date(y, m, 0);
  d.setHours(0, 0, 0, 0);
  return d;
}

function lastBalanceAtOrBefore(series: { date: string; balance: number }[], key: string): number {
  let last = series[0]?.balance ?? 0;
  for (const p of series) {
    if (p.date <= key) last = p.balance;
    else break;
  }
  return last;
}

function parseDateSafe(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
