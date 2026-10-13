import { differenceInCalendarMonths } from "date-fns";
import { listGoals, getHistoricalContributionRate } from "@/lib/repo/goals";
import type { GoalProgress, SavingsGoal } from "@/lib/types";
import { addMonths, fromISODate, startOfToday, toISODate } from "@/lib/utils/date";

/**
 * Savings-goal projections.
 *
 * Required contribution and completion dates are computed from the goal's own
 * numbers plus the user's recorded contribution behaviour. They are estimates,
 * and the UI labels them as such.
 */
export function computeGoalProgress(
  goal: SavingsGoal,
  options: {
    today?: Date;
    /** Recorded average monthly contribution across all goals. */
    historicalMonthlyCents?: number;
  } = {},
): GoalProgress {
  const today = options.today ?? startOfToday();
  const historical = options.historicalMonthlyCents ?? 0;

  const remainingCents = Math.max(0, goal.targetCents - goal.currentCents);
  const progressRatio =
    goal.targetCents > 0 ? Math.min(1, goal.currentCents / goal.targetCents) : 0;

  const monthsRemaining = goal.targetDate
    ? Math.max(0, differenceInCalendarMonths(fromISODate(goal.targetDate), today))
    : null;

  // Prefer the user's recorded pace; fall back to the planned contribution.
  const projectedContributionCents =
    historical > 0 ? historical : goal.monthlyContributionCents;

  const requiredMonthlyCents =
    monthsRemaining && monthsRemaining > 0
      ? Math.ceil(remainingCents / monthsRemaining)
      : projectedContributionCents;

  const perMonth = projectedContributionCents > 0 ? projectedContributionCents : 0;
  const monthsToComplete = perMonth > 0 ? Math.ceil(remainingCents / perMonth) : null;

  const estimatedCompletionDate =
    monthsToComplete === null
      ? null
      : toISODate(addMonths(today, monthsToComplete));

  const onTrack =
    goal.targetDate === null ||
    monthsToComplete === null ||
    (estimatedCompletionDate !== null &&
      estimatedCompletionDate <= goal.targetDate);

  return {
    goal,
    remainingCents,
    progressRatio,
    requiredMonthlyCents,
    onTrack,
    monthsRemaining,
    estimatedCompletionDate,
    monthsToComplete,
    monthsLate:
      monthsRemaining !== null && monthsToComplete !== null
        ? Math.max(0, monthsToComplete - monthsRemaining)
        : null,
    projectedContributionCents,
  };
}

export async function getGoalProgress(
  userId: string,
): Promise<GoalProgress[]> {
  const goals = await listGoals(userId);
  if (goals.length === 0) return [];

  const historical = await getHistoricalContributionRate(userId, 6);
  const today = startOfToday();
  return goals.map((goal) => computeGoalProgress(goal, { today, historicalMonthlyCents: historical }));
}

export async function getGoalProgressFor(
  userId: string,
  goalId: string,
): Promise<GoalProgress | null> {
  const all = await getGoalProgress(userId);
  return all.find((entry) => entry.goal.id === goalId) ?? null;
}

export type GoalTotals = {
  goalCount: number;
  targetCents: number;
  currentCents: number;
  remainingCents: number;
  overallRatio: number;
  monthlyContributionCents: number;
  goalsOnTrack: number;
};

/** Aggregate numbers for the goals header. */
export function summariseGoals(progress: GoalProgress[]): GoalTotals {
  const targetCents = progress.reduce((sum, entry) => sum + entry.goal.targetCents, 0);
  const currentCents = progress.reduce((sum, entry) => sum + entry.goal.currentCents, 0);
  return {
    goalCount: progress.length,
    targetCents,
    currentCents,
    remainingCents: Math.max(0, targetCents - currentCents),
    overallRatio: targetCents > 0 ? Math.min(1, currentCents / targetCents) : 0,
    monthlyContributionCents: progress.reduce(
      (sum, entry) => sum + entry.goal.monthlyContributionCents,
      0,
    ),
    goalsOnTrack: progress.filter((entry) => entry.onTrack).length,
  };
}

/** Contribution pace needed per month to finish a goal by its target date. */
export function requiredMonthlyForGoal(goal: SavingsGoal, today = startOfToday()): number {
  if (!goal.targetDate) return goal.monthlyContributionCents;
  const months = Math.max(
    1,
    differenceInCalendarMonths(fromISODate(goal.targetDate), today),
  );
  return Math.ceil(Math.max(0, goal.targetCents - goal.currentCents) / months);
}