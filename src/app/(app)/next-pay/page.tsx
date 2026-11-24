import { requireUser } from "@/lib/auth/guard";
import { getNextPaySummary } from "@/lib/services/finance/next-pay";
import { NextPayManager } from "@/components/app/next-pay-manager";

export const dynamic = "force-dynamic";

export default async function NextPayPage() {
  const user = await requireUser();
  const summary = await getNextPaySummary(user.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Next pay</h1>
        <p className="text-xs text-muted-foreground">
          Log the hours you work each day and see what your next pay should be, after tax.
          This is a standalone estimate — it never touches your net worth, transactions or
          forecast.
        </p>
      </div>
      <NextPayManager
        settings={summary.settings}
        entries={summary.entries}
        totalHours={summary.totalHours}
        grossCents={summary.grossCents}
        taxCents={summary.taxCents}
        netCents={summary.netCents}
        currency={user.currency}
      />
    </div>
  );
}