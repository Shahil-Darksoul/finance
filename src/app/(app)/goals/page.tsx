import { requireUser } from "@/lib/auth/guard";
import { getGoalProgress } from "@/lib/services/finance/goals";
import { Card, CardBody, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Target, Plus } from "lucide-react";
import Link from "next/link";
import { formatMoney, formatPercent } from "@/lib/utils/money";
import { ProgressBar } from "@/components/ui/progress";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const user = await requireUser();
  const goals = await getGoalProgress(user.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Savings Goals</h1>
          <p className="text-xs text-muted-foreground">Track progress toward your targets</p>
        </div>
        <Button asChild><Link href="/goals/new"><Plus className="h-4 w-4"/>Add goal</Link></Button>
      </div>

      <Card>
        <CardBody>
          {goals.length === 0 ? (
            <EmptyState icon={<Target className="h-6 w-6"/>} title="No goals yet" description="Create a savings goal to track your progress." action={<Button asChild><Link href="/goals/new">Add goal</Link></Button>} />
          ) : (
            <div className="space-y-4">
              {goals.map(g => (
                <div key={g.goal.id} className="rounded-lg border border-border p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium">{g.goal.name}</p>
                      {g.goal.targetDate && <p className="text-xs text-muted-foreground">Target: {new Date(g.goal.targetDate + 'T00:00:00').toLocaleDateString()}</p>}
                    </div>
                    <p className="text-sm font-medium">{formatPercent(g.progressRatio)}</p>
                  </div>
                  <ProgressBar value={g.progressRatio} showValue={false} />
                  <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                    <span>{formatMoney(g.goal.currentCents, { currency: user.currency })} saved</span>
                    <span>of {formatMoney(g.goal.targetCents, { currency: user.currency })}</span>
                  </div>
                  {g.remainingCents > 0 && <p className="text-xs text-muted-foreground mt-1">Still need {formatMoney(g.remainingCents, { currency: user.currency })}</p>}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
