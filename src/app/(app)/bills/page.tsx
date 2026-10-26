import { requireUser } from "@/lib/auth/guard";
import { listBills } from "@/lib/repo/bills";
import { listAccounts } from "@/lib/repo/accounts";
import { Card, CardBody, CardHeader, EmptyState, Badge } from "@/components/ui/card";
import { buttonClass } from "@/components/ui/button";
import { Receipt, Plus, TrendingUp, LineChart } from "lucide-react";
import Link from "next/link";
import { formatMoney } from "@/lib/utils/money";
import { BillActions } from "@/components/app/bill-actions";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  bill: "Bill",
  emi: "EMI",
  sip: "Investment plan",
};

export default async function BillsPage() {
  const user = await requireUser();
  const [bills, accounts] = await Promise.all([
    listBills(user.id),
    listAccounts(user.id, { includeArchived: true }),
  ]);
  const editableAccounts = accounts.map(({ id, name, isArchived }) => ({
    id,
    name,
    isArchived,
  }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Bills & EMIs</h1>
          <p className="text-xs text-muted-foreground">Track recurring bills, loans and investment plans</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/investments/new" className={buttonClass({ size: "sm", variant: "outline" })}>
            <LineChart className="h-4 w-4" />
            Add investment
          </Link>
          <Link href="/bills/new?kind=sip" className={buttonClass({ size: "sm", variant: "outline" })}>
            <TrendingUp className="h-4 w-4" />
            Add SIP / plan
          </Link>
          <Link href="/bills/new" className={buttonClass({ size: "sm" })}>
            <Plus className="h-4 w-4" />
            Add bill
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader title="Bills & plans" />
        <CardBody>
          {bills.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-6 w-6" />}
              title="No bills yet"
              description="Add your recurring bills, loans or SIP plans to get reminders and projections."
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <Link href="/investments/new" className={buttonClass({ size: "sm", variant: "outline" })}>
                    <LineChart className="h-4 w-4" />
                    Add investment
                  </Link>
                  <Link href="/bills/new?kind=sip" className={buttonClass({ size: "sm", variant: "outline" })}>
                    <TrendingUp className="h-4 w-4" />
                    Add SIP / plan
                  </Link>
                  <Link href="/bills/new" className={buttonClass({ size: "sm" })}>
                    <Plus className="h-4 w-4" />
                    Add bill
                  </Link>
                </div>
              }
            />
          ) : (
            <div className="divide-y divide-border">
              {bills.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">
                        {b.name}
                        {b.kind === "sip" && b.investmentSymbol ? (
                          <span className="ml-1.5 text-muted-foreground">({b.investmentSymbol})</span>
                        ) : null}
                      </p>
                      <Badge tone={b.kind === "sip" ? "accent" : b.kind === "emi" ? "negative" : "warning"}>
                        {KIND_LABEL[b.kind] ?? b.kind}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Due {b.dueDay} of month • {b.frequency}
                      {b.accountName ? ` • Paid from ${b.accountName}` : ""}
                      {b.kind === "sip" ? " • Tracked separately from Investments" : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className="shrink-0 font-medium tabular-nums">
                      {formatMoney(b.amountCents, { currency: user.currency })}
                    </p>
                    <BillActions bill={b} currency={user.currency} accounts={editableAccounts} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
