import { addMonths } from "date-fns";

export type AmortizationRow = {
  /** 1-based payment number. */
  period: number;
  dueDate: string;
  paymentCents: number;
  interestCents: number;
  principalCents: number;
  balanceAfterCents: number;
};

export type AmortizationSummary = {
  monthlyPaymentCents: number;
  totalPayments: number;
  totalInterestCents: number;
  totalPayableCents: number;
  rows: AmortizationRow[];
};

/**
 * Standard reducing-balance loan amortisation.
 *
 *   EMI = P · r · (1 + r)^n / ((1 + r)^n − 1)
 *
 * where r is the monthly interest rate. All amounts are integer cents; the
 * final payment absorbs any rounding remainder so the balance always reaches
 * exactly zero.
 */
export function buildAmortization(input: {
  principalCents: number;
  annualRatePercent: number;
  termMonths: number;
  /** ISO date of the first instalment. */
  firstDueDate: string;
  /** Instalments already made (excluded from the schedule). */
  paymentsMade?: number;
}): AmortizationSummary {
  const paymentsMade = Math.max(0, input.paymentsMade ?? 0);
  const term = Math.max(1, Math.round(input.termMonths));
  const principal = Math.max(0, Math.trunc(input.principalCents));

  // Zero-interest loans simply divide the principal.
  const monthlyRate = input.annualRatePercent / 100 / 12;

  let payment: number;
  if (monthlyRate <= 0) {
    payment = Math.round(principal / term);
  } else {
    const factor = Math.pow(1 + monthlyRate, term);
    payment = Math.round((principal * monthlyRate * factor) / (factor - 1));
  }

  const rows: AmortizationRow[] = [];
  let balance = principal;
  let totalInterest = 0;

  for (let period = paymentsMade + 1; period <= term; period += 1) {
    const interest = Math.round(balance * monthlyRate);
    // Final instalment clears whatever is left plus that period's interest.
    const principalPart =
      period === term ? balance : Math.min(balance, payment - interest);
    const actualPayment = principalPart + interest;

    balance = Math.max(0, balance - principalPart);
    totalInterest += interest;

    rows.push({
      period,
      dueDate: instalmentDueDate(input.firstDueDate, period - 1),
      paymentCents: actualPayment,
      interestCents: interest,
      principalCents: principalPart,
      balanceAfterCents: balance,
    });
  }

  return {
    monthlyPaymentCents: payment,
    totalPayments: rows.length,
    totalInterestCents: totalInterest,
    totalPayableCents: rows.reduce((sum, row) => sum + row.paymentCents, 0),
    rows,
  };
}

/** Remaining interest for a loan already `paymentsMade` instalments in. */
export function remainingInterest(input: {
  principalCents: number;
  annualRatePercent: number;
  termMonths: number;
  paymentsMade: number;
  firstDueDate: string;
}): number {
  return buildAmortization(input).totalInterestCents;
}

/**
 * Total interest already paid by an amortizing loan.
 * Derived by amortising the schedule and summing the skipped instalments.
 */
export function paidInterest(input: {
  principalCents: number;
  annualRatePercent: number;
  termMonths: number;
  paymentsMade: number;
  firstDueDate: string;
}): number {
  const full = buildAmortization({ ...input, paymentsMade: 0 });
  const remaining = buildAmortization({
    ...input,
    paymentsMade: input.paymentsMade,
  });
  return full.totalInterestCents - remaining.totalInterestCents;
}

/**
 * Due date of instalment `index` (0-based), keeping the day of the month the
 * first instalment fell on. A loan due on the 31st is due on the last day of
 * shorter months rather than drifting back to the 28th.
 */
function instalmentDueDate(firstDueDate: string, index: number): string {
  const first = new Date(`${firstDueDate}T00:00:00`);
  const target = addMonths(new Date(first.getFullYear(), first.getMonth(), 1), index);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  const day = Math.min(first.getDate(), lastDay);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Estimated payoff (final instalment) date as an ISO date. */
export function payoffDate(termMonths: number, firstDueDate: string): string {
  return instalmentDueDate(firstDueDate, Math.max(0, termMonths - 1));
}