import { addDays, addMonths, startOfMonth, subMonths } from "date-fns";
import { getDb } from "@/lib/db";
import { newId } from "@/lib/utils/id";
import { getUserById } from "@/lib/repo/users";
import { DEFAULT_CURRENCY } from "@/lib/utils/currency";
import { buildAmortization } from "./emi";
import { occurrencesInRange } from "./recurrence";
import { paydayRules } from "./payday";
import { startOfToday, toISODate } from "@/lib/utils/date";

/**
 * Deterministic demo dataset.
 *
 * Two purposes:
 *   1. let a new user understand the app before entering anything, and
 *   2. give the analytics and forecast engines a realistic history to work with.
 *
 * All figures are fictional and are flagged with `users.is_demo = 1`, which the
 * UI surfaces so demo numbers can never be mistaken for real financial data.
 * Re-running the seeder wipes the previous demo data first, so the dataset
 * always stays internally consistent.
 */

const MONTHS_OF_HISTORY = 14;

/** Deterministic PRNG (mulberry32) so the demo looks the same on every run. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type DemoOptions = {
  /** Overrides the monthly history length. Useful for tests. */
  months?: number;
};

export async function seedDemoData(
  userId: string,
  options: DemoOptions = {},
): Promise<void> {
  const months = options.months ?? MONTHS_OF_HISTORY;
  const db = await getDb();
  const random = createRandom(0x5eed_1234);
  const today = startOfToday();
  const now = new Date().toISOString();

  // The fictional dataset is denominated in the app's single currency so its
  // accounts and holdings are valued and totalled consistently everywhere.
  const owner = await getUserById(userId);
  const currency = owner?.currency ?? DEFAULT_CURRENCY;

  await clearDemoData(userId);

  /* ---------------------------------------------------------- accounts */
  const accountSpecs: {
    key: AccountKey;
    name: string;
    type: string;
    opening: number;
    color: string;
    institution: string;
    limit: number;
  }[] = [
    { key: "checking", name: "Everyday Checking", type: "checking", opening: 3_240_00, color: "#0ea5e9", institution: "Northbank", limit: 0 },
    { key: "savings", name: "Rainy Day Savings", type: "savings", opening: 6_400_00, color: "#10b981", institution: "Northbank", limit: 0 },
    { key: "emergency", name: "Emergency Fund", type: "emergency", opening: 7_500_00, color: "#22c55e", institution: "Northbank", limit: 0 },
    { key: "highyield", name: "High-Yield Savings", type: "high_yield", opening: 3_180_00, color: "#14b8a6", institution: "Summit Bank", limit: 0 },
    { key: "brokerage", name: "Brokerage", type: "brokerage", opening: 0, color: "#8b5cf6", institution: "Summit Bank", limit: 0 },
    { key: "credit", name: "Rewards Credit Card", type: "credit_card", opening: -1_180_00, color: "#f43f5e", institution: "Northbank", limit: 8_000_00 },
  ];

  const accounts = {} as Record<AccountKey, string>;
  const accountRows = accountSpecs.map((spec, index) => {
    const id = newId();
    accounts[spec.key] = id;
    return { ...spec, id, index };
  });

  await db.tx(async (tx) => {
    for (const account of accountRows) {
      await tx.run(
        `INSERT INTO accounts (
            id, user_id, name, type, institution, opening_balance_cents,
            credit_limit_cents, currency, color, include_in_net_worth,
            is_archived, sort_order, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)`,
        [
          account.id,
          userId,
          account.name,
          account.type,
          account.institution,
          account.opening,
          account.limit,
          currency,
          account.color,
          account.index,
          now,
          now,
        ],
      );
    }
  });

  /* -------------------------------------------------------- categories */
  const categoryRows = await db.all<{ id: string; name: string }>(
    `SELECT id, name FROM categories WHERE user_id = ?`,
    [userId],
  );
  const categoryId = new Map(categoryRows.map((row) => [row.name, row.id]));

  /* ------------------------------------------------------------ paydays */
  const paydaySpecs = [
    { label: "Primary salary", amount: 2_180_00, account: "checking", offsetDays: 0, raiseFromIndex: 7 },
    { label: "Freelance project", amount: 940_00, account: "checking", offsetDays: 6, raiseFromIndex: 12 },
  ] as const;

  const paydays = paydaySpecs.map((spec) => ({
    ...spec,
    id: newId(),
    startDate: toISODate(addDays(subMonths(today, months), spec.offsetDays)),
    amount: spec.amount,
  }));

  await db.tx(async (tx) => {
    for (const [index, payday] of paydays.entries()) {
      await tx.run(
        `INSERT INTO paydays (
            id, user_id, label, start_date, frequency, second_day, anchor_day,
            amount_cents, account_id, sort_order, active, created_at
         ) VALUES (?, ?, ?, ?, 'biweekly', NULL, NULL, ?, ?, ?, 1, ?)`,
        [payday.id, userId, payday.label, payday.startDate, payday.amount, accounts[payday.account], index, now],
      );
    }
  });

  /* -------------------------------------------------------------- goals */
  const goalSpecs = [
    { key: "emergency", name: "Six Months of Expenses", target: 24_000_00, monthly: 500_00, monthsOut: 16, progress: 0.52, priority: "high", account: "emergency", color: "#22c55e" },
    { key: "vacation", name: "Japan Trip", target: 6_500_00, monthly: 350_00, monthsOut: 10, progress: 0.38, priority: "medium", account: "savings", color: "#0ea5e9" },
    { key: "car", name: "New Car", target: 20_000_00, monthly: 450_00, monthsOut: 30, progress: 0.21, priority: "medium", account: "highyield", color: "#8b5cf6" },
  ] as const;

  await db.tx(async (tx) => {
    for (const goal of goalSpecs) {
      const goalId = newId();
      await tx.run(
        `INSERT INTO savings_goals (
            id, user_id, name, description, target_cents, target_date,
            monthly_contribution_cents, priority, account_id, color, icon,
            archived, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?)`,
        [
          goalId,
          userId,
          goal.name,
          "Demo goal — fictional data.",
          goal.target,
          toISODate(addMonths(today, goal.monthsOut)),
          goal.monthly,
          goal.priority,
          accounts[goal.account],
          goal.color,
          now,
          now,
        ],
      );
      // Seed current progress so the bars are not all empty.
      const seeded = Math.round(goal.target * goal.progress);
      await tx.run(
        `INSERT INTO goal_contributions (
            id, user_id, goal_id, amount_cents, date, account_id,
            transaction_id, note, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'Demo seed', ?)`,
        [newId(), userId, goalId, seeded, toISODate(subMonths(today, 1)), accounts[goal.account], now],
      );
      // A few recent monthly contributions.
      for (let back = 6; back >= 1; back -= 1) {
        await tx.run(
          `INSERT INTO goal_contributions (
              id, user_id, goal_id, amount_cents, date, account_id,
              transaction_id, note, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'Demo contribution', ?)`,
          [newId(), userId, goalId, goal.monthly, toISODate(subMonths(today, back)), accounts[goal.account], now],
        );
      }
    }
  });

  /* -------------------------------------------------------------- bills */
  const emiDueDay = 3;
  const emiSpec = {
    principal: 18_400_00,
    annualRatePercent: 7.4,
    termMonths: 60,
    monthsPaid: Math.min(22, months),
  };
  // Anchor the schedule to the same day-of-month the bill is due on, so the
  // instalments land on the day the calendar shows.
  const emiFirstDue = subMonths(today, emiSpec.monthsPaid);
  emiFirstDue.setDate(emiDueDay);
  const emiSchedule = buildAmortization({
    principalCents: emiSpec.principal,
    annualRatePercent: emiSpec.annualRatePercent,
    termMonths: emiSpec.termMonths,
    firstDueDate: toISODate(emiFirstDue),
  });

  const billSpecs = [
    { name: "Rent", amount: 1_520_00, day: 1, account: "checking", category: "Housing", autopay: true },
    { name: "Internet", amount: 75_00, day: 5, account: "checking", category: "Utilities", autopay: true },
    { name: "Electricity", amount: 124_00, day: 12, account: "checking", category: "Utilities", autopay: false },
    { name: "Mobile plan", amount: 80_00, day: 8, account: "checking", category: "Utilities", autopay: true },
    { name: "Renters insurance", amount: 128_00, day: 15, account: "checking", category: "Insurance", autopay: true },
  ] as const;

  await db.tx(async (tx) => {
    await tx.run(
      `INSERT INTO bills (
          id, user_id, name, kind, amount_cents, frequency, due_day, start_date,
          account_id, category_id, autopay, priority, notes, active,
          principal_cents, annual_rate, term_months, current_principal_cents,
          payments_made, created_at, updated_at
       ) VALUES (?, ?, 'Car loan', 'emi', ?, 'monthly', ?, ?, ?, ?, 1, 'high',
          'Demo loan — fictional.', 1, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        userId,
        emiSchedule.monthlyPaymentCents,
        emiDueDay,
        toISODate(emiFirstDue),
        accounts.checking,
        categoryId.get("Debt") ?? null,
        emiSpec.principal,
        emiSpec.annualRatePercent,
        emiSpec.termMonths,
        emiSchedule.rows[emiSpec.monthsPaid]?.balanceAfterCents ?? 0,
        emiSpec.monthsPaid,
        now,
        now,
      ],
    );

    for (const bill of billSpecs) {
      await tx.run(
        `INSERT INTO bills (
            id, user_id, name, kind, amount_cents, frequency, due_day, start_date,
            account_id, category_id, autopay, priority, notes, active,
            annual_rate, payments_made, created_at, updated_at
         ) VALUES (?, ?, ?, 'bill', ?, 'monthly', ?, ?, ?, ?, ?, 'normal', NULL, 1, 0, 0, ?, ?)`,
        [
          newId(),
          userId,
          bill.name,
          bill.amount,
          bill.day,
          toISODate(subMonths(today, months)),
          accounts[bill.account],
          categoryId.get(bill.category) ?? null,
          bill.autopay ? 1 : 0,
          now,
          now,
        ],
      );
    }
  });

  /* --------------------------------------------------- subscriptions */
  const subscriptionSpecs = [
    { name: "Netflix", amount: 22_99, day: 22 },
    { name: "Spotify", amount: 11_99, day: 6 },
    { name: "Cloud storage", amount: 2_99, day: 18 },
    { name: "Gym membership", amount: 45_00, day: 3 },
  ] as const;

  await db.tx(async (tx) => {
    for (const subscription of subscriptionSpecs) {
      await tx.run(
        `INSERT INTO recurring_transactions (
            id, user_id, name, type, amount_cents, category_id, account_id,
            payment_method, frequency, interval_count, days_of_week, day_of_month,
            month_of_year, start_date, end_date, next_occurrence, active, notes,
            created_at, updated_at
       ) VALUES (?, ?, ?, 'expense', ?, ?, ?, 'Debit card', 'monthly', 1,
            NULL, ?, NULL, ?, NULL, NULL, 1, 'Demo subscription', ?, ?)`,
        [
          newId(),
          userId,
          subscription.name,
          subscription.amount,
          categoryId.get("Subscriptions") ?? null,
          accounts.checking,
          subscription.day,
          toISODate(subMonths(today, months)),
          now,
          now,
        ],
      );
    }
  });

  /* ------------------------------------------------------- investments */
  const investmentSpecs = [
    { symbol: "VTI", name: "Vanguard Total Stock Market ETF", type: "etf", quantity: 42, avgCost: 232_40 },
    { symbol: "AAPL", name: "Apple Inc.", type: "stock", quantity: 16, avgCost: 178_25 },
    { symbol: "MSFT", name: "Microsoft Corporation", type: "stock", quantity: 9, avgCost: 372_10 },
    { symbol: "SCHD", name: "Schwab U.S. Dividend Equity ETF", type: "etf", quantity: 61, avgCost: 26_85 },
  ] as const;

  await db.tx(async (tx) => {
    for (const holding of investmentSpecs) {
      const investmentId = newId();
      const boughtOn = toISODate(subMonths(today, months - 1));
      await tx.run(
        `INSERT INTO investments (
            id, user_id, symbol, name, asset_type, quantity, avg_cost_cents,
            currency, account_id, notes, archived, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Demo holding — fictional.', 0, ?, ?)`,
        [investmentId, userId, holding.symbol, holding.name, holding.type, holding.quantity, holding.avgCost, currency, accounts.brokerage, now, now],
      );
      await tx.run(
        `INSERT INTO investment_transactions (
            id, user_id, investment_id, type, quantity, price_cents, amount_cents,
            fees_cents, date, notes, transaction_id, created_at
         ) VALUES (?, ?, ?, 'buy', ?, ?, ?, 0, ?, 'Initial demo position', NULL, ?)`,
        [newId(), userId, investmentId, holding.quantity, holding.avgCost, holding.avgCost * holding.quantity, boughtOn, now],
      );
    }
  });

  /* ------------------------------------------------------ transactions */
  const transactions: {
    accountId: string | null;
    relatedAccountId?: string | null;
    categoryId: string | null;
    type: string;
    amountCents: number;
    date: string;
    description: string;
    merchant?: string;
    paymentMethod?: string;
    isRecurring?: boolean;
  }[] = [];

  const push = (row: (typeof transactions)[number]) => {
    if (row.date <= toISODate(today)) transactions.push(row);
  };

  const daysIn = (anchor: Date) =>
    new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0).getDate();

  const onDay = (anchor: Date, day: number) =>
    new Date(anchor.getFullYear(), anchor.getMonth(), Math.min(day, daysIn(anchor)));

  for (let back = months; back >= 0; back -= 1) {
    const monthAnchor = startOfMonth(subMonths(today, back));
    const monthIndex = months - back;

    /* Paychecks. */
    for (const payday of paydays) {
      const rule = paydayRules({
        id: payday.id,
        label: payday.label,
        startDate: payday.startDate,
        frequency: "biweekly",
        amountCents: payday.amount,
        accountId: accounts[payday.account],
      })[0].rule;
      const raise = monthIndex >= payday.raiseFromIndex ? 1.06 : 1;
      for (const date of occurrencesInRange(rule, monthAnchor, addMonths(monthAnchor, 1), 6)) {
        push({
          accountId: accounts[payday.account],
          categoryId: categoryId.get("Salary") ?? null,
          type: "income",
          amountCents: Math.round(payday.amount * raise),
          date: toISODate(date),
          description: "Paycheck",
          paymentMethod: "Bank transfer",
        });
      }
    }

    /* Fixed monthly bills. */
    for (const bill of billSpecs) {
      push({
        accountId: accounts[bill.account],
        categoryId: categoryId.get(bill.category) ?? null,
        type: "expense",
        amountCents: bill.amount,
        date: toISODate(onDay(monthAnchor, bill.day)),
        description: bill.name,
        merchant: bill.name,
        paymentMethod: bill.autopay ? "Direct debit" : "Debit card",
        isRecurring: true,
      });
    }

    /* Car loan instalments. */
    if (monthIndex < emiSpec.monthsPaid) {
      push({
        accountId: accounts.checking,
        categoryId: categoryId.get("Debt") ?? null,
        type: "expense",
        amountCents: emiSchedule.monthlyPaymentCents,
        date: toISODate(onDay(monthAnchor, 3)),
        description: "Car loan instalment",
        paymentMethod: "Direct debit",
        isRecurring: true,
      });
    }

    /* Subscriptions. */
    for (const subscription of subscriptionSpecs) {
      push({
        accountId: accounts.checking,
        categoryId: categoryId.get("Subscriptions") ?? null,
        type: "expense",
        amountCents: subscription.amount,
        date: toISODate(onDay(monthAnchor, subscription.day)),
        description: subscription.name,
        merchant: subscription.name,
        paymentMethod: "Credit card",
        isRecurring: true,
      });
    }

    /* Variable spending. */
    const groceryRuns = 5 + Math.floor(random() * 3);
    for (let i = 0; i < groceryRuns; i += 1) {
      push({
        accountId: accounts.checking,
        categoryId: categoryId.get("Groceries") ?? null,
        type: "expense",
        amountCents: between(random, 62, 178),
        date: toISODate(onDay(monthAnchor, 2 + Math.floor(random() * (daysIn(monthAnchor) - 3)))),
        description: "Groceries",
        merchant: pick(random, ["Whole Foods", "Trader Joe's", "Local Market", "Costco"]),
        paymentMethod: "Debit card",
      });
    }

    for (let i = 0; i < 3 + Math.floor(random() * 4); i += 1) {
      push({
        accountId: accounts.credit,
        categoryId: categoryId.get("Food") ?? null,
        type: "expense",
        amountCents: between(random, 18, 84),
        date: toISODate(onDay(monthAnchor, 1 + Math.floor(random() * (daysIn(monthAnchor) - 2)))),
        description: "Dining out",
        merchant: pick(random, ["Cafe Nord", "Sushi Bar", "Taqueria", "Pizza House", "Thai Kitchen"]),
        paymentMethod: "Credit card",
      });
    }

    for (let i = 0; i < 3; i += 1) {
      push({
        accountId: accounts.credit,
        categoryId: categoryId.get("Transportation") ?? null,
        type: "expense",
        amountCents: between(random, 32, 78),
        date: toISODate(onDay(monthAnchor, 1 + Math.floor(random() * (daysIn(monthAnchor) - 2)))),
        description: "Fuel",
        merchant: "Shell",
        paymentMethod: "Credit card",
      });
    }

    for (let i = 0; i < 2; i += 1) {
      const categoryName = pick(random, ["Shopping", "Entertainment", "Healthcare", "Education"]);
      push({
        accountId: accounts.credit,
        categoryId: categoryId.get(categoryName) ?? null,
        type: "expense",
        amountCents: between(random, 24, 240),
        date: toISODate(onDay(monthAnchor, 1 + Math.floor(random() * (daysIn(monthAnchor) - 2)))),
        description: pick(random, ["Household supplies", "Concert tickets", "Pharmacy", "Books", "Sportswear"]),
        merchant: pick(random, ["Target", "Amazon", "Local Books", "CVS"]),
        paymentMethod: "Credit card",
      });
    }

    if (monthIndex % 5 === 3) {
      push({
        accountId: accounts.credit,
        categoryId: categoryId.get("Travel") ?? null,
        type: "expense",
        amountCents: between(random, 320, 980),
        date: toISODate(onDay(monthAnchor, 14)),
        description: "Weekend trip",
        paymentMethod: "Credit card",
      });
    }

    /* Monthly investment purchase. */
    if (monthIndex >= 2) {
      const symbol = monthIndex % 2 === 0 ? "VTI" : "SCHD";
      const amountCents = 30_000 + Math.round(random() * 8) * 1_000;
      const date = toISODate(onDay(monthAnchor, 20));
      if (date <= toISODate(today)) {
        // Cash must actually move to the broker for the purchase, otherwise the
        // securities would exist with no money behind them and net worth would
        // double-count the same dollars.
        push({
          accountId: accounts.checking,
          relatedAccountId: accounts.brokerage,
          categoryId: null,
          type: "transfer",
          amountCents,
          date,
          description: `Contribution for ${symbol}`,
        });
        const holding = investmentSpecs.find((item) => item.symbol === symbol);
        if (holding) {
          await db.run(
            `INSERT INTO investment_transactions (
                id, user_id, investment_id, type, quantity, price_cents,
                amount_cents, fees_cents, date, notes, transaction_id, created_at
             ) VALUES (?, ?, (SELECT id FROM investments WHERE user_id = ? AND symbol = ?),
                'buy', ?, ?, ?, 0, ?, 'Demo recurring contribution', NULL, ?)`,
            [newId(), userId, userId, symbol, 3, Math.round(amountCents / 3), amountCents, date, now],
          );
        }
      }
    }

    /* Monthly automatic savings transfer. */
    push({
      accountId: accounts.checking,
      relatedAccountId: accounts.savings,
      categoryId: null,
      type: "transfer",
      amountCents: 60_000,
      date: toISODate(onDay(monthAnchor, 26)),
      description: "Automatic savings transfer",
    });

    /* Quarterly dividend. */
    if (monthIndex % 3 === 1) {
      push({
        accountId: accounts.brokerage,
        categoryId: categoryId.get("Investments") ?? null,
        type: "income",
        amountCents: between(random, 90, 320),
        date: toISODate(onDay(monthAnchor, 16)),
        description: "Dividend payment",
        paymentMethod: "Brokerage transfer",
      });
    }
  }

  await db.tx(async (tx) => {
    for (const row of transactions) {
      await tx.run(
        `INSERT INTO transactions (
            id, user_id, account_id, related_account_id, category_id, goal_id,
            recurring_id, type, amount_cents, date, description, merchant,
            payment_method, notes, status, is_recurring, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, ?, ?, NULL, 'cleared', ?, ?, ?)`,
        [
          newId(),
          userId,
          row.accountId,
          row.relatedAccountId ?? null,
          row.categoryId,
          row.type,
          Math.abs(Math.trunc(row.amountCents)),
          row.date,
          row.description,
          row.merchant ?? null,
          row.paymentMethod ?? null,
          row.isRecurring ? 1 : 0,
          now,
          now,
        ],
      );
    }
  });

  /* --------------------------------------------------- snapshots */
  // Monthly points so the net-worth chart has history on first load.
  await db.tx(async (tx) => {
    for (let back = months; back >= 0; back -= 1) {
      const steps = months - back;
      await tx.run(
        `INSERT INTO snapshots (
            id, user_id, date, net_worth_cents, cash_cents, savings_cents,
            investments_cents, debt_cents, income_cents, expense_cents, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId(),
          userId,
          toISODate(startOfMonth(subMonths(today, back))),
          Math.round(19_000_00 + steps * 1_350_00 + Math.sin(back) * 90_000),
          Math.round(8_000_00 + steps * 180_000),
          Math.round(6_000_00 + steps * 480_000),
          Math.round(9_800_00 + steps * 690_000),
          Math.max(0, Math.round(14_500_00 - steps * 480_000)),
          4_600_00,
          3_150_00,
          now,
        ],
      );
    }
  });

  await db.run(
    `UPDATE users SET is_demo = 1, onboarding_step = 99, updated_at = ? WHERE id = ?`,
    [now, userId],
  );
}

type AccountKey =
  | "checking"
  | "savings"
  | "emergency"
  | "highyield"
  | "brokerage"
  | "credit";

function between(random: () => number, min: number, max: number): number {
  return Math.round((min + random() * (max - min)) * 100);
}

function pick<T>(random: () => number, options: readonly T[]): T {
  return options[Math.floor(random() * options.length) % options.length];
}

/** Removes everything the seeder created for this user. */
export async function clearDemoData(userId: string): Promise<void> {
  const db = await getDb();
  const now = new Date().toISOString();
  await db.tx(async (tx) => {
    // Snapshots first: it is only a foreign key to users, but deleting in a
    // predictable order keeps this readable.
    await tx.run(`DELETE FROM snapshots WHERE user_id = ?`, [userId]);
    await tx.run(`DELETE FROM goal_contributions WHERE user_id = ?`, [userId]);
    await tx.run(`DELETE FROM savings_goals WHERE user_id = ?`, [userId]);
    await tx.run(`DELETE FROM investment_transactions WHERE user_id = ?`, [userId]);
    await tx.run(`DELETE FROM investment_deletions WHERE user_id = ?`, [userId]);
    await tx.run(`DELETE FROM investments WHERE user_id = ?`, [userId]);
    await tx.run(`DELETE FROM recurring_transactions WHERE user_id = ?`, [userId]);
    await tx.run(`DELETE FROM emi_payments WHERE user_id = ?`, [userId]);
    await tx.run(`DELETE FROM bills WHERE user_id = ?`, [userId]);
    await tx.run(`DELETE FROM paydays WHERE user_id = ?`, [userId]);
    await tx.run(`DELETE FROM transactions WHERE user_id = ?`, [userId]);
    await tx.run(`DELETE FROM transaction_deletions WHERE user_id = ?`, [userId]);
    // Only now is it safe to drop accounts, since transactions no longer
    // reference them.
    await tx.run(`DELETE FROM accounts WHERE user_id = ?`, [userId]);
    await tx.run(`UPDATE users SET is_demo = 0, onboarding_step = 0, updated_at = ? WHERE id = ?`, [
      now,
      userId,
    ]);
  });
}