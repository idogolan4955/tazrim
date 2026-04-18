export interface SpitzerRow {
  period: number;
  paymentDate: Date;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

export interface SpitzerInput {
  principal: number;
  annualRatePct: number;
  termMonths: number;
  startDate: Date;
}

/**
 * Spitzer (equal-payment) amortization schedule.
 * monthlyRate = annual / 12 / 100
 * payment = P * r / (1 - (1+r)^-n)
 */
export function spitzerSchedule({ principal, annualRatePct, termMonths, startDate }: SpitzerInput): SpitzerRow[] {
  const r = annualRatePct / 100 / 12;
  const n = termMonths;
  const payment = r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
  const rows: SpitzerRow[] = [];
  let balance = principal;
  for (let i = 1; i <= n; i++) {
    const interest = balance * r;
    const principalPart = payment - interest;
    balance = Math.max(0, balance - principalPart);
    const paymentDate = new Date(startDate);
    paymentDate.setMonth(paymentDate.getMonth() + i);
    rows.push({
      period: i,
      paymentDate,
      payment: round2(payment),
      principal: round2(principalPart),
      interest: round2(interest),
      balance: round2(balance),
    });
  }
  return rows;
}

export function monthlyPayment(principal: number, annualRatePct: number, termMonths: number) {
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principal / termMonths;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
