/**
 * Domain model.
 *
 * These are the camelCase shapes the UI and services work with. Database rows
 * are snake_case and converted by the mappers in `src/lib/repo/*`.
 *
 * Monetary values are always integer cents.
 */

/* ------------------------------------------------------------ constants */

export const ACCOUNT_TYPES = [
  "checking",
  "savings",
  "emergency",
  "high_yield",
  "credit_card",
  "cash",
  "brokerage",
  "loan",
  "other",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

/** Account types a deposited check or paycheck can actually land in. */
export const DEPOSIT_ACCOUNT_TYPES: readonly AccountType[] = [
  "checking",
  "cash",
  "savings",
  "high_yield",
  "emergency",
];

export const ACCOUNT_TYPE_META: Record<
  AccountType,
  { label: string; icon: string; kind: "asset" | "liability"; tone: string }
> = {
  checking: { label: "Checking", icon: "Wallet", kind: "asset", tone: "info" },
  savings: { label: "Savings", icon: "PiggyBank", kind: "asset", tone: "primary" },
  emergency: { label: "Emergency Fund", icon: "ShieldCheck", kind: "asset", tone: "positive" },
  high_yield: { label: "High-Yield Savings", icon: "TrendingUp", kind: "asset", tone: "positive" },
  credit_card: { label: "Credit Card", icon: "CreditCard", kind: "liability", tone: "negative" },
  cash: { label: "Cash", icon: "Banknote", kind: "asset", tone: "muted" },
  brokerage: { label: "Brokerage", icon: "LineChart", kind: "asset", tone: "accent" },
  loan: { label: "Loan", icon: "Landmark", kind: "liability", tone: "negative" },
  other: { label: "Other", icon: "Boxes", kind: "asset", tone: "muted" },
};

export const TRANSACTION_TYPES = [
  "income",
  "expense",
  "transfer",
  "investment",
  "refund",
  "lending",
  "other",
] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_META: Record<
  TransactionType,
  { label: string; verb: string; cashImpact: "in" | "out" | "none"; tone: string }
> = {
  income: { label: "Income", verb: "received", cashImpact: "in", tone: "positive" },
  expense: { label: "Expense", verb: "spent", cashImpact: "out", tone: "negative" },
  transfer: { label: "Transfer", verb: "transferred", cashImpact: "none", tone: "info" },
  investment: { label: "Investment", verb: "invested", cashImpact: "out", tone: "accent" },
  refund: { label: "Refund", verb: "refunded", cashImpact: "in", tone: "positive" },
  /**
   * Money given to another person. It leaves the account but is not spending,
   * so it is excluded from expense totals and tracked as a receivable that
   * still counts towards net worth until it is repaid.
   */
  lending: { label: "Lent", verb: "lent to", cashImpact: "out", tone: "warning" },
  other: { label: "Other", verb: "recorded", cashImpact: "none", tone: "muted" },
};

/** Categories seeded for every new account (per-user rows). */
export const DEFAULT_CATEGORIES: {
  name: string;
  kind: "expense" | "income";
  color: string;
  icon: string;
}[] = [
  { name: "Housing", kind: "expense", color: "#6366f1", icon: "Home" },
  { name: "Transportation", kind: "expense", color: "#0ea5e9", icon: "Car" },
  { name: "Food", kind: "expense", color: "#f97316", icon: "Utensils" },
  { name: "Groceries", kind: "expense", color: "#84cc16", icon: "ShoppingBasket" },
  { name: "Shopping", kind: "expense", color: "#ec4899", icon: "ShoppingBag" },
  { name: "Entertainment", kind: "expense", color: "#a855f7", icon: "Film" },
  { name: "Utilities", kind: "expense", color: "#14b8a6", icon: "Lightbulb" },
  { name: "Insurance", kind: "expense", color: "#22c55e", icon: "Shield" },
  { name: "Healthcare", kind: "expense", color: "#ef4444", icon: "HeartPulse" },
  { name: "Education", kind: "expense", color: "#3b82f6", icon: "GraduationCap" },
  { name: "Subscriptions", kind: "expense", color: "#eab308", icon: "Repeat" },
  { name: "Travel", kind: "expense", color: "#06b6d4", icon: "Plane" },
  { name: "Debt", kind: "expense", color: "#f43f5e", icon: "CreditCard" },
  { name: "Savings", kind: "expense", color: "#10b981", icon: "PiggyBank" },
  { name: "Investing", kind: "expense", color: "#8b5cf6", icon: "LineChart" },
  { name: "Other", kind: "expense", color: "#94a3b8", icon: "Shapes" },
  { name: "Salary", kind: "income", color: "#10b981", icon: "Banknote" },
  { name: "Freelance", kind: "income", color: "#06b6d4", icon: "Laptop" },
  { name: "Investments", kind: "income", color: "#8b5cf6", icon: "TrendingUp" },
  { name: "Refunds", kind: "income", color: "#f97316", icon: "Undo2" },
  { name: "Other Income", kind: "income", color: "#94a3b8", icon: "Shapes" },
];

export const PAYMENT_METHODS = [
  "Bank transfer",
  "Debit card",
  "Credit card",
  "Cash",
  "Direct debit",
  "Mobile payment",
  "Cheque",
  "Other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const RECURRENCE_FREQUENCIES = [
  "daily",
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
  "custom",
] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const FREQUENCY_META: Record<
  RecurrenceFrequency,
  { label: string; interval: number; unit: "day" | "week" | "month" | "year" }
> = {
  daily: { label: "Daily", interval: 1, unit: "day" },
  weekly: { label: "Weekly", interval: 1, unit: "week" },
  biweekly: { label: "Every 2 weeks", interval: 2, unit: "week" },
  monthly: { label: "Monthly", interval: 1, unit: "month" },
  quarterly: { label: "Quarterly", interval: 3, unit: "month" },
  yearly: { label: "Yearly", interval: 1, unit: "year" },
  custom: { label: "Custom", interval: 1, unit: "month" },
};

export const BILL_FREQUENCIES = [
  "weekly",
  "biweekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;
export type BillFrequency = (typeof BILL_FREQUENCIES)[number];

export const PAYDAY_FREQUENCIES = [
  "weekly",
  "biweekly",
  "semimonthly",
  "monthly",
] as const;
export type PaydayFrequency = (typeof PAYDAY_FREQUENCIES)[number];

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const INVESTMENT_TYPES = [
  "buy",
  "sell",
  "dividend",
  "split",
  "deposit",
  "withdrawal",
  "fee",
] as const;
export type InvestmentTransactionType = (typeof INVESTMENT_TYPES)[number];

export const ASSET_TYPES = ["stock", "etf", "mutual_fund", "crypto", "bond"] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const SCENARIOS = ["conservative", "trend", "optimistic"] as const;
export type Scenario = (typeof SCENARIOS)[number];

export const SCENARIO_META: Record<
  Scenario,
  { label: string; summary: string; incomeFactor: number; expenseFactor: number; contributionFactor: number; returnFactor: number }
> = {
  conservative: {
    label: "Conservative",
    summary: "Lower expected savings and flatter investment growth.",
    incomeFactor: 1,
    expenseFactor: 1.05,
    contributionFactor: 0.85,
    returnFactor: 0.5,
  },
  trend: {
    label: "Historical Trend",
    summary: "Uses your own recorded income, expense and saving behaviour.",
    incomeFactor: 1,
    expenseFactor: 1,
    contributionFactor: 1,
    returnFactor: 1,
  },
  optimistic: {
    label: "Optimistic",
    summary: "Assumes a higher saving rate and stronger contribution pace.",
    incomeFactor: 1.05,
    expenseFactor: 0.95,
    contributionFactor: 1.2,
    returnFactor: 1.25,
  },
};

export const NOTIFICATION_KEYS = [
  "bill_due",
  "emi_due",
  "payday",
  "low_balance",
  "savings_milestone",
  "goal_progress",
  "large_spend",
  "recurring_payment",
  "investment_update",
] as const;
export type NotificationKey = (typeof NOTIFICATION_KEYS)[number];

export const NOTIFICATION_META: Record<
  NotificationKey,
  { label: string; description: string }
> = {
  bill_due: { label: "Bills due", description: "A bill is due within 7 days" },
  emi_due: { label: "EMIs due", description: "A loan instalment is due soon" },
  payday: { label: "Payday", description: "Your next payday is approaching" },
  low_balance: { label: "Low balance", description: "An account dropped below your threshold" },
  savings_milestone: { label: "Savings milestone", description: "You crossed a savings milestone" },
  goal_progress: { label: "Goal progress", description: "A savings goal moved forward" },
  large_spend: { label: "Large spending", description: "An expense was much larger than usual" },
  recurring_payment: { label: "Recurring payment", description: "A recurring charge is processing" },
  investment_update: { label: "Investment update", description: "Portfolio value or a quote changed" },
};

/* --------------------------------------------------------------- models */

export type User = {
  id: string;
  email: string;
  name: string;
  currency: string;
  isDemo: boolean;
  onboardingStep: number;
  createdAt: string;
};

export type Account = {
  id: string;
  userId: string;
  name: string;
  type: AccountType;
  institution: string | null;
  openingBalanceCents: number;
  creditLimitCents: number;
  currency: string;
  color: string | null;
  icon: string | null;
  note: string | null;
  includeInNetWorth: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** Derived: opening balance + all transaction impacts. */
  currentBalanceCents: number;
  /** Derived. */
  availableBalanceCents: number;
  transactionCount?: number;
};

export type Category = {
  id: string;
  userId: string;
  name: string;
  kind: "expense" | "income";
  color: string | null;
  icon: string | null;
  isSystem: boolean;
  sortOrder: number;
};

export type Transaction = {
  id: string;
  userId: string;
  accountId: string | null;
  accountName?: string | null;
  relatedAccountId: string | null;
  relatedAccountName?: string | null;
  categoryId: string | null;
  categoryName?: string | null;
  categoryColor?: string | null;
  goalId: string | null;
  recurringId: string | null;
  paydayId: string | null;
  type: TransactionType;
  /** Always a positive magnitude; `cashImpactCents` carries the sign. */
  amountCents: number;
  /** Signed effect on `accountId` balance. */
  cashImpactCents: number;
  date: string;
  description: string | null;
  merchant: string | null;
  paymentMethod: string | null;
  notes: string | null;
  status: "cleared" | "pending";
  isRecurring: boolean;
  createdAt: string;
};

export type RecurringTransaction = {
  id: string;
  userId: string;
  name: string;
  type: TransactionType;
  amountCents: number;
  categoryId: string | null;
  accountId: string | null;
  paymentMethod: string | null;
  frequency: RecurrenceFrequency;
  intervalCount: number;
  daysOfWeek: string | null;
  dayOfMonth: number | null;
  monthOfYear: number | null;
  startDate: string;
  endDate: string | null;
  nextOccurrence: string | null;
  active: boolean;
  notes: string | null;
  createdAt: string;
};

export type Bill = {
  id: string;
  userId: string;
  name: string;
  kind: "bill" | "emi";
  amountCents: number;
  frequency: BillFrequency;
  dueDay: number;
  startDate: string;
  endDate: string | null;
  accountId: string | null;
  accountName?: string | null;
  categoryId: string | null;
  categoryName?: string | null;
  autopay: boolean;
  priority: Priority;
  notes: string | null;
  active: boolean;
  principalCents: number | null;
  annualRate: number;
  termMonths: number | null;
  currentPrincipalCents: number | null;
  paymentsMade: number;
  createdAt: string;
  updatedAt: string;
};

export type EmiPayment = {
  id: string;
  billId: string;
  userId: string;
  dueDate: string;
  amountCents: number;
  principalCents: number;
  interestCents: number;
  balanceAfterCents: number;
  status: "scheduled" | "paid";
  transactionId: string | null;
  createdAt: string;
};

export type Payday = {
  id: string;
  userId: string;
  label: string;
  startDate: string;
  frequency: PaydayFrequency;
  secondDay: number | null;
  anchorDay: number | null;
  amountCents: number;
  accountId: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
};

export type SavingsGoal = {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  targetCents: number;
  /** Sum of contributions; recomputed whenever contributions change. */
  currentCents: number;
  targetDate: string | null;
  monthlyContributionCents: number;
  priority: Priority;
  accountId: string | null;
  accountName?: string | null;
  color: string | null;
  icon: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GoalContribution = {
  id: string;
  userId: string;
  goalId: string;
  amountCents: number;
  date: string;
  accountId: string | null;
  transactionId: string | null;
  note: string | null;
  createdAt: string;
};

export type GoalProgress = {
  goal: SavingsGoal;
  remainingCents: number;
  progressRatio: number;
  requiredMonthlyCents: number;
  onTrack: boolean;
  monthsRemaining: number | null;
  estimatedCompletionDate: string | null;
  monthsToComplete: number | null;
  monthsLate: number | null;
  projectedContributionCents: number;
};

/** Currencies a holding's price and cost are recorded in. No FX conversion. */
export const INVESTMENT_CURRENCIES = ["USD", "CAD"] as const;
export type InvestmentCurrency = (typeof INVESTMENT_CURRENCIES)[number];

export type Investment = {
  id: string;
  userId: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  quantity: number;
  avgCostCents: number;
  /** The currency this holding is priced and displayed in. */
  currency: string;
  accountId: string | null;
  notes: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type InvestmentTransaction = {
  id: string;
  userId: string;
  investmentId: string;
  type: InvestmentTransactionType;
  quantity: number;
  priceCents: number;
  amountCents: number;
  feesCents: number;
  date: string;
  notes: string | null;
  transactionId: string | null;
  createdAt: string;
};

export type Holding = {
  investment: Investment;
  quote: Quote | null;
  marketValueCents: number;
  costBasisCents: number;
  unrealizedGainCents: number;
  unrealizedGainRatio: number;
  dayChangeCents: number;
  dayChangeRatio: number;
  allocationRatio: number;
  /** True when the quote came from the simulated provider. */
  simulated: boolean;
};

export type Quote = {
  symbol: string;
  priceCents: number;
  previousCloseCents: number;
  changeCents: number;
  changeRatio: number;
  currency: string;
  /** When the market data was produced. */
  marketTime: string;
  fetchedAt: string;
  provider: string;
  /** Data may be delayed; never present it as guaranteed real-time. */
  delayed: boolean;
  simulated: boolean;
};

export type PricePoint = { date: string; closeCents: number };

/** Totals for holdings that are not in the portfolio's primary currency. */
export type CurrencySubtotal = {
  currency: string;
  valueCents: number;
  investedCents: number;
  gainCents: number;
};

export type PortfolioSummary = {
  /** The primary currency these totals are expressed in (the account currency). */
  currency: string;
  totalValueCents: number;
  investedCents: number;
  totalGainCents: number;
  totalGainRatio: number;
  dayChangeCents: number;
  dayChangeRatio: number;
  holdingsCount: number;
  /** Native-currency subtotals for holdings outside `currency` (never converted). */
  otherCurrencyTotals: CurrencySubtotal[];
  asOf: string;
  simulated: boolean;
  provider: string | null;
};

export type Snapshot = {
  date: string;
  netWorthCents: number;
  cashCents: number;
  savingsCents: number;
  investmentsCents: number;
  debtCents: number;
  incomeCents: number;
  expenseCents: number;
};

export type NotificationRow = {
  id: string;
  key: string;
  title: string;
  body: string | null;
  severity: "info" | "success" | "warning" | "danger";
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ForecastRow = {
  id: string;
  label: string;
  scenario: Scenario;
  months: number;
  params: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  createdAt: string;
};

/* ------------------------------------------------------ derived shapes */

export type FinancialSummary = {
  netWorthCents: number;
  cashCents: number;
  savingsCents: number;
  debtCents: number;
  investmentsCents: number;
  /** Outstanding money lent to others; still counts towards net worth. */
  receivablesCents: number;
  monthlyIncomeCents: number;
  monthlyExpenseCents: number;
  monthlySavingsCents: number;
  savingsRate: number;
  priorMonthIncomeCents: number;
  priorMonthExpenseCents: number;
  priorMonthSavingsCents: number;
};

export type UpcomingObligation = {
  id: string;
  source: "bill" | "emi" | "recurring" | "goal" | "investment";
  name: string;
  dueDate: string;
  amountCents: number;
  accountId: string | null;
  autopay: boolean;
};

export type PaydayOccurrence = {
  paydayId: string;
  label: string;
  date: string;
  amountCents: number;
  accountId: string | null;
  /** True when this date has a per-check amount set (an occurrence override). */
  amountEdited?: boolean;
};

export type PaycheckProjection = {
  payday: PaydayOccurrence | null;
  nextPaydayDate: string | null;
  daysUntilPayday: number | null;
  expectedPaycheckCents: number;
  availableCashCents: number;
  obligations: UpcomingObligation[];
  obligationsTotalCents: number;
  plannedExpensesCents: number;
  projectedRemainingCents: number;
  safeToSpendCents: number;
  expectedSavingsCents: number;
  /** Paydays that fall inside the window, for context. */
  otherPaydaysInWindow: PaydayOccurrence[];
  currency: string;
};

export type MonthlySeriesPoint = {
  month: string;
  incomeCents: number;
  expenseCents: number;
  savingsCents: number;
  savingsRate: number;
  netWorthCents?: number;
};

export type CategoryBreakdown = {
  categoryId: string | null;
  categoryName: string;
  color: string | null;
  amountCents: number;
  ratio: number;
  transactionCount: number;
};

export type HealthMetric = {
  key: string;
  label: string;
  value: number;
  display: string;
  status: "good" | "fair" | "poor" | "unknown";
  explanation: string;
  /** 0..1 progress used by the ring indicator. */
  ratio: number;
};

export type Insight = {
  id: string;
  kind: "positive" | "neutral" | "watch" | "info";
  title: string;
  detail: string;
  /** Whether the number is a fact, calculation, estimate or forecast. */
  basis: "fact" | "calculation" | "estimate" | "forecast";
  /** The exact figures used, so the user can verify the claim. */
  evidence: string[];
};

export type ForecastAssumptions = {
  averageMonthlyIncomeCents: number;
  averageMonthlyExpenseCents: number;
  averageMonthlySavingsCents: number;
  monthlyInvestmentContributionCents: number;
  investmentReturnRatio: number;
  currentSavingsCents: number;
  currentInvestmentsCents: number;
  trendIncomeRatio: number;
  trendExpenseRatio: number;
  /** Monthly amount earmarked for active savings goals. */
  plannedGoalContributionCents: number;
};

export type ForecastPoint = {
  month: string;
  savingsCents: number;
  investmentsCents: number;
  netWorthCents: number;
  cumulativeContributionsCents: number;
  cumulativeGrowthCents: number;
};

export type ForecastResult = {
  scenario: Scenario;
  months: number;
  assumptions: ForecastAssumptions;
  points: ForecastPoint[];
  finalSavingsCents: number;
  finalInvestmentsCents: number;
  finalNetWorthCents: number;
  totalContributionsCents: number;
  totalGrowthCents: number;
  milestones: { label: string; date: string; cents: number }[];
};

export type CalendarEvent = {
  id: string;
  source: "payday" | "bill" | "emi" | "recurring" | "goal" | "investment" | "transaction";
  title: string;
  date: string;
  amountCents: number;
  recurring: boolean;
  accountId: string | null;
  color: string | null;
  /** True for a payday whose amount was set for this date. */
  amountEdited?: boolean;
  /** Present on transaction events, for the agenda delete action. */
  type?: TransactionType;
  merchant?: string | null;
};