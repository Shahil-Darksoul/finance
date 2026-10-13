/**
 * Row -> model mappers.
 *
 * Database rows are snake_case with 0/1 integers for booleans; the app works
 * with camelCase and real booleans. All conversion happens here so the rest of
 * the codebase never touches raw rows.
 */

import type {
  Account,
  Bill,
  Category,
  EmiPayment,
  ForecastRow,
  GoalContribution,
  Investment,
  InvestmentTransaction,
  NotificationRow,
  Payday,
  RecurringTransaction,
  SavingsGoal,
  Snapshot,
  Transaction,
  User,
} from "@/lib/types";

export const bool = (value: unknown): boolean => value === 1 || value === true;
export const num = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};
export const int = (value: unknown): number => Math.trunc(num(value));
export const str = (value: unknown): string => String(value ?? "");
export const strOrNull = (value: unknown): string | null =>
  value === null || value === undefined || value === "" ? null : String(value);

/* ------------------------------------------------------------------ user */

export type UserRow = {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  currency: string;
  is_demo: number;
  onboarding_step: number;
  created_at: string;
  updated_at: string;
};

export function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    currency: row.currency,
    isDemo: bool(row.is_demo),
    onboardingStep: int(row.onboarding_step),
    createdAt: row.created_at,
  };
}

/* --------------------------------------------------------------- account */

export type AccountRow = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  institution: string | null;
  opening_balance_cents: number;
  credit_limit_cents: number;
  currency: string;
  color: string | null;
  icon: string | null;
  note: string | null;
  include_in_net_worth: number;
  is_archived: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
  current_balance_cents?: number;
  transaction_count?: number;
};

export function toAccount(row: AccountRow): Account {
  const current = int(row.current_balance_cents);
  const limit = int(row.credit_limit_cents);
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type as Account["type"],
    institution: strOrNull(row.institution),
    openingBalanceCents: int(row.opening_balance_cents),
    creditLimitCents: limit,
    currency: row.currency,
    color: strOrNull(row.color),
    icon: strOrNull(row.icon),
    note: strOrNull(row.note),
    includeInNetWorth: bool(row.include_in_net_worth),
    isArchived: bool(row.is_archived),
    sortOrder: int(row.sort_order),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currentBalanceCents: current,
    availableBalanceCents:
      row.type === "credit_card" ? limit + Math.min(0, current) : current,
    transactionCount: int(row.transaction_count),
  };
}

/* ------------------------------------------------------------- category */

export type CategoryRow = {
  id: string;
  user_id: string;
  name: string;
  kind: string;
  color: string | null;
  icon: string | null;
  is_system: number;
  sort_order: number;
};

export function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    kind: row.kind === "income" ? "income" : "expense",
    color: strOrNull(row.color),
    icon: strOrNull(row.icon),
    isSystem: bool(row.is_system),
    sortOrder: int(row.sort_order),
  };
}

/* ---------------------------------------------------------- transaction */

export type TransactionRow = {
  id: string;
  user_id: string;
  account_id: string | null;
  related_account_id: string | null;
  category_id: string | null;
  goal_id: string | null;
  recurring_id: string | null;
  payday_id: string | null;
  type: string;
  amount_cents: number;
  date: string;
  description: string | null;
  merchant: string | null;
  payment_method: string | null;
  notes: string | null;
  status: string;
  is_recurring: number;
  created_at: string;
  account_name?: string | null;
  related_account_name?: string | null;
  category_name?: string | null;
  category_color?: string | null;
};

/**
 * Signed effect of a transaction on its primary account balance.
 *
 * `transfer` rows carry `relatedAccountId` as the destination; the source side
 * is the primary account, so only the outgoing amount is stored here. Analytics
 * deliberately ignore transfers so they never inflate income or expenses.
 */
export function signedImpact(row: Pick<TransactionRow, "type" | "amount_cents">): number {
  const amount = int(row.amount_cents);
  switch (row.type) {
    case "income":
    case "refund":
      return amount;
    case "expense":
    case "investment":
      return -amount;
    case "transfer":
      return -amount;
    case "lending":
      // The cash leaves the account; it is held as a receivable, not spent.
      return -amount;
    default:
      return 0;
  }
}

export function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    userId: row.user_id,
    accountId: strOrNull(row.account_id),
    accountName: strOrNull(row.account_name),
    relatedAccountId: strOrNull(row.related_account_id),
    relatedAccountName: strOrNull(row.related_account_name),
    categoryId: strOrNull(row.category_id),
    categoryName: strOrNull(row.category_name),
    categoryColor: strOrNull(row.category_color),
    goalId: strOrNull(row.goal_id),
    recurringId: strOrNull(row.recurring_id),
    paydayId: strOrNull(row.payday_id),
    type: row.type as Transaction["type"],
    amountCents: int(row.amount_cents),
    cashImpactCents: signedImpact(row),
    date: row.date,
    description: strOrNull(row.description),
    merchant: strOrNull(row.merchant),
    paymentMethod: strOrNull(row.payment_method),
    notes: strOrNull(row.notes),
    status: row.status === "pending" ? "pending" : "cleared",
    isRecurring: bool(row.is_recurring),
    createdAt: row.created_at,
  };
}

/* ---------------------------------------------------- recurring template */

export type RecurringRow = {
  id: string;
  user_id: string;
  name: string;
  type: string;
  amount_cents: number;
  category_id: string | null;
  account_id: string | null;
  payment_method: string | null;
  frequency: string;
  interval_count: number;
  days_of_week: string | null;
  day_of_month: number | null;
  month_of_year: number | null;
  start_date: string;
  end_date: string | null;
  next_occurrence: string | null;
  active: number;
  notes: string | null;
  created_at: string;
};

export function toRecurring(row: RecurringRow): RecurringTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    type: row.type as Transaction["type"],
    amountCents: int(row.amount_cents),
    categoryId: strOrNull(row.category_id),
    accountId: strOrNull(row.account_id),
    paymentMethod: strOrNull(row.payment_method),
    frequency: row.frequency as RecurringTransaction["frequency"],
    intervalCount: Math.max(1, int(row.interval_count)),
    daysOfWeek: strOrNull(row.days_of_week),
    dayOfMonth: row.day_of_month === null ? null : int(row.day_of_month),
    monthOfYear: row.month_of_year === null ? null : int(row.month_of_year),
    startDate: row.start_date,
    endDate: strOrNull(row.end_date),
    nextOccurrence: strOrNull(row.next_occurrence),
    active: bool(row.active),
    notes: strOrNull(row.notes),
    createdAt: row.created_at,
  };
}

/* ----------------------------------------------------------------- bill */

export type BillRow = {
  id: string;
  user_id: string;
  name: string;
  kind: string;
  amount_cents: number;
  frequency: string;
  due_day: number;
  start_date: string;
  end_date: string | null;
  account_id: string | null;
  category_id: string | null;
  autopay: number;
  priority: string;
  notes: string | null;
  active: number;
  principal_cents: number | null;
  annual_rate: number;
  term_months: number | null;
  current_principal_cents: number | null;
  payments_made: number;
  created_at: string;
  updated_at: string;
  account_name?: string | null;
  category_name?: string | null;
};

export function toBill(row: BillRow): Bill {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    kind: row.kind === "emi" ? "emi" : "bill",
    amountCents: int(row.amount_cents),
    frequency: row.frequency as Bill["frequency"],
    dueDay: int(row.due_day),
    startDate: row.start_date,
    endDate: strOrNull(row.end_date),
    accountId: strOrNull(row.account_id),
    accountName: strOrNull(row.account_name),
    categoryId: strOrNull(row.category_id),
    categoryName: strOrNull(row.category_name),
    autopay: bool(row.autopay),
    priority: (row.priority as Bill["priority"]) ?? "normal",
    notes: strOrNull(row.notes),
    active: bool(row.active),
    principalCents: row.principal_cents === null ? null : int(row.principal_cents),
    annualRate: num(row.annual_rate),
    termMonths: row.term_months === null ? null : int(row.term_months),
    currentPrincipalCents:
      row.current_principal_cents === null ? null : int(row.current_principal_cents),
    paymentsMade: int(row.payments_made),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type EmiPaymentRow = {
  id: string;
  bill_id: string;
  user_id: string;
  due_date: string;
  amount_cents: number;
  principal_cents: number;
  interest_cents: number;
  balance_after_cents: number;
  status: string;
  transaction_id: string | null;
  created_at: string;
};

export function toEmiPayment(row: EmiPaymentRow): EmiPayment {
  return {
    id: row.id,
    billId: row.bill_id,
    userId: row.user_id,
    dueDate: row.due_date,
    amountCents: int(row.amount_cents),
    principalCents: int(row.principal_cents),
    interestCents: int(row.interest_cents),
    balanceAfterCents: int(row.balance_after_cents),
    status: row.status === "paid" ? "paid" : "scheduled",
    transactionId: strOrNull(row.transaction_id),
    createdAt: row.created_at,
  };
}

/* --------------------------------------------------------------- payday */

export type PaydayRow = {
  id: string;
  user_id: string;
  label: string;
  start_date: string;
  frequency: string;
  second_day: number | null;
  anchor_day: number | null;
  amount_cents: number;
  account_id: string | null;
  sort_order: number;
  active: number;
  created_at: string;
};

export function toPayday(row: PaydayRow): Payday {
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    startDate: row.start_date,
    frequency: row.frequency as Payday["frequency"],
    secondDay: row.second_day === null ? null : int(row.second_day),
    anchorDay: row.anchor_day === null ? null : int(row.anchor_day),
    amountCents: int(row.amount_cents),
    accountId: strOrNull(row.account_id),
    sortOrder: int(row.sort_order),
    active: bool(row.active),
    createdAt: row.created_at,
  };
}

/* ---------------------------------------------------------------- goal */

export type GoalRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  target_cents: number;
  current_cents?: number;
  target_date: string | null;
  monthly_contribution_cents: number;
  priority: string;
  account_id: string | null;
  color: string | null;
  icon: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
  account_name?: string | null;
};

export function toGoal(row: GoalRow): SavingsGoal {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    description: strOrNull(row.description),
    targetCents: int(row.target_cents),
    currentCents: int(row.current_cents),
    targetDate: strOrNull(row.target_date),
    monthlyContributionCents: int(row.monthly_contribution_cents),
    priority: (row.priority as SavingsGoal["priority"]) ?? "medium",
    accountId: strOrNull(row.account_id),
    accountName: strOrNull(row.account_name),
    color: strOrNull(row.color),
    icon: strOrNull(row.icon),
    archived: bool(row.archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type GoalContributionRow = {
  id: string;
  user_id: string;
  goal_id: string;
  amount_cents: number;
  date: string;
  account_id: string | null;
  transaction_id: string | null;
  note: string | null;
  created_at: string;
};

export function toGoalContribution(row: GoalContributionRow): GoalContribution {
  return {
    id: row.id,
    userId: row.user_id,
    goalId: row.goal_id,
    amountCents: int(row.amount_cents),
    date: row.date,
    accountId: strOrNull(row.account_id),
    transactionId: strOrNull(row.transaction_id),
    note: strOrNull(row.note),
    createdAt: row.created_at,
  };
}

/* ---------------------------------------------------------- investment */

export type InvestmentRow = {
  id: string;
  user_id: string;
  symbol: string;
  name: string;
  asset_type: string;
  quantity: number;
  avg_cost_cents: number;
  currency: string;
  account_id: string | null;
  notes: string | null;
  archived: number;
  created_at: string;
  updated_at: string;
};

export function toInvestment(row: InvestmentRow): Investment {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    name: row.name,
    assetType: row.asset_type as Investment["assetType"],
    quantity: num(row.quantity),
    avgCostCents: int(row.avg_cost_cents),
    currency: row.currency ?? "USD",
    accountId: strOrNull(row.account_id),
    notes: strOrNull(row.notes),
    archived: bool(row.archived),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type InvestmentTransactionRow = {
  id: string;
  user_id: string;
  investment_id: string;
  type: string;
  quantity: number;
  price_cents: number;
  amount_cents: number;
  fees_cents: number;
  date: string;
  notes: string | null;
  transaction_id: string | null;
  created_at: string;
};

export function toInvestmentTransaction(
  row: InvestmentTransactionRow,
): InvestmentTransaction {
  return {
    id: row.id,
    userId: row.user_id,
    investmentId: row.investment_id,
    type: row.type as InvestmentTransaction["type"],
    quantity: num(row.quantity),
    priceCents: int(row.price_cents),
    amountCents: int(row.amount_cents),
    feesCents: int(row.fees_cents),
    date: row.date,
    notes: strOrNull(row.notes),
    transactionId: strOrNull(row.transaction_id),
    createdAt: row.created_at,
  };
}

/* ------------------------------------------------------------ snapshot */

export type SnapshotRow = {
  date: string;
  net_worth_cents: number;
  cash_cents: number;
  savings_cents: number;
  investments_cents: number;
  debt_cents: number;
  income_cents: number;
  expense_cents: number;
};

export function toSnapshot(row: SnapshotRow): Snapshot {
  return {
    date: row.date,
    netWorthCents: int(row.net_worth_cents),
    cashCents: int(row.cash_cents),
    savingsCents: int(row.savings_cents),
    investmentsCents: int(row.investments_cents),
    debtCents: int(row.debt_cents),
    incomeCents: int(row.income_cents),
    expenseCents: int(row.expense_cents),
  };
}

/* ------------------------------------------------------- notifications */

export type NotificationDbRow = {
  id: string;
  key: string;
  title: string;
  body: string | null;
  severity: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function toNotification(row: NotificationDbRow): NotificationRow {
  return {
    id: row.id,
    key: row.key,
    title: row.title,
    body: strOrNull(row.body),
    severity: (row.severity as NotificationRow["severity"]) ?? "info",
    link: strOrNull(row.link),
    readAt: strOrNull(row.read_at),
    createdAt: row.created_at,
  };
}

/* ----------------------------------------------------------- forecast */

export type ForecastDbRow = {
  id: string;
  label: string;
  scenario: string;
  months: number;
  params_json: string | null;
  result_json: string | null;
  created_at: string;
};

function parseJson(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function toForecast(row: ForecastDbRow): ForecastRow {
  return {
    id: row.id,
    label: row.label,
    scenario: row.scenario as ForecastRow["scenario"],
    months: int(row.months),
    params: parseJson(row.params_json),
    result: parseJson(row.result_json),
    createdAt: row.created_at,
  };
}