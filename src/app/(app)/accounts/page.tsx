import { requireUser } from "@/lib/auth/guard";
import { listAccounts } from "@/lib/repo/accounts";
import { Card, CardBody, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EditAccountDialog } from "@/components/app/edit-account-dialog";
import { DeleteAccountButton } from "@/components/app/delete-account-button";
import { Wallet, Plus } from "lucide-react";
import Link from "next/link";
import { formatMoney } from "@/lib/utils/money";
import { cn } from "@/lib/utils/cn";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const user = await requireUser();
  const accounts = await listAccounts(user.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Accounts</h1>
          <p className="text-xs text-muted-foreground">Manage your cash, savings, credit, and investment accounts</p>
        </div>
        <Button asChild>
          <Link href="/accounts/new">
            <Plus className="h-4 w-4" />
            Add account
          </Link>
        </Button>
      </div>

      <Card>
        <CardBody>
          {accounts.length === 0 ? (
            <EmptyState
              icon={<Wallet className="h-6 w-6" />}
              title="No accounts yet"
              description="Add your first account to start tracking your net worth."
              action={<Button asChild><Link href="/accounts/new">Add account</Link></Button>}
            />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {accounts.map(a => (
                <Card key={a.id}>
                  <CardBody>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{a.name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{a.type.replace('_', ' ')}</p>
                      </div>
                      <div className="flex items-center gap-0.5">
                        <EditAccountDialog
                          account={{
                            id: a.id,
                            name: a.name,
                            type: a.type,
                            institution: a.institution,
                            currency: a.currency,
                            currentBalanceCents: a.currentBalanceCents,
                            creditLimitCents: a.creditLimitCents,
                            note: a.note,
                            includeInNetWorth: a.includeInNetWorth,
                          }}
                        />
                        <DeleteAccountButton
                          account={{
                            id: a.id,
                            name: a.name,
                            type: a.type,
                            currency: a.currency,
                            currentBalanceCents: a.currentBalanceCents,
                          }}
                        />
                      </div>
                    </div>
                    <p
                      className={cn(
                        "mt-3 text-xl font-semibold tabular-nums",
                        a.currentBalanceCents < 0
                          ? "text-negative"
                          : a.currentBalanceCents > 0
                            ? "text-positive"
                            : "text-foreground",
                      )}
                    >
                      {formatMoney(a.currentBalanceCents, { currency: a.currency })}
                    </p>
                    {a.currentBalanceCents < 0 ? (
                      <p className="mt-0.5 text-[11px] text-negative/80">Owed</p>
                    ) : null}
                    {a.institution && <p className="text-xs text-muted-foreground mt-1">{a.institution}</p>}
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
