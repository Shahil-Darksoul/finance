import { requireUser } from "@/lib/auth/guard";
import { listTransactions } from "@/lib/repo/transactions";
import { listAccounts } from "@/lib/repo/accounts";
import { listCategories } from "@/lib/repo/categories";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeleteTransactionButton } from "@/components/app/delete-transaction-button";
import { formatMoney } from "@/lib/utils/money";
import { DEBT_PAYMENT_CATEGORY_NAMES } from "@/lib/types";
import { Receipt, Plus } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const DEBT_PAYMENT_CATEGORY_NAME_SET = new Set<string>(
  Object.values(DEBT_PAYMENT_CATEGORY_NAMES),
);

export default async function TransactionsPage() {
  const user = await requireUser();
  const [transactions, accounts, categories] = await Promise.all([
    listTransactions(user.id, { limit: 50 }),
    listAccounts(user.id),
    listCategories(user.id),
  ]);

  const money = formatMoney;
  const accountMap = new Map(accounts.map(a => [a.id, a]));
  const categoryMap = new Map(categories.map(c => [c.id, c]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Transactions</h1>
          <p className="text-xs text-muted-foreground">
            Track income, expenses, and transfers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild>
            <Link href="/transactions/new">
              <Plus className="h-4 w-4" />
              Add transaction
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader title="Recent transactions" description="Showing your latest activity" />
        <CardBody>
          {transactions.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-6 w-6" />}
              title="No transactions yet"
              description="Start by adding your first transaction or importing from CSV."
              action={
                <Button asChild>
                  <Link href="/transactions/new">Add transaction</Link>
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="py-2 text-left">Date</th>
                    <th className="py-2 text-left">Description</th>
                    <th className="py-2 text-left">Category</th>
                    <th className="py-2 text-left">Account</th>
                    <th className="py-2 text-right">Amount</th>
                    <th className="py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(t => {
                    const account = t.accountId ? accountMap.get(t.accountId) : null;
                    const category = t.categoryId ? categoryMap.get(t.categoryId) : null;
                    // A transfer that pays down a card or loan is spending even
                    // though it is stored as a transfer, so it reads as a
                    // negative amount here and in the reports.
                    const isDebtPayment =
                      t.type === 'transfer' &&
                      (t.relatedAccountType === 'credit_card' ||
                        t.relatedAccountType === 'loan' ||
                        (category ? DEBT_PAYMENT_CATEGORY_NAME_SET.has(category.name) : false));
                    const isExpense = t.type === 'expense' || t.type === 'lending' || isDebtPayment;
                    const isIncome = t.type === 'income';
                    const displayCents = t.type === 'transfer' && !isDebtPayment ? t.amountCents : t.cashImpactCents;
                    return (
                      <tr key={t.id} className="border-b border-border/50">
                        <td className="py-2">{new Date(t.date + 'T00:00:00').toLocaleDateString()}</td>
                        <td className="py-2 font-medium">{t.description || t.merchant || '—'}</td>
                        <td className="py-2 text-muted-foreground">{category?.name || '—'}</td>
                        <td className="py-2 text-muted-foreground">
                          {t.type === 'transfer' && t.relatedAccountName
                            ? `${account?.name ?? '—'} → ${t.relatedAccountName}`
                            : account?.name || '—'}
                        </td>
                        <td className={`py-2 text-right tabular-nums ${isExpense ? 'text-negative' : isIncome ? 'text-positive' : ''}`}>
                          {money(displayCents, {
                            signed: (t.type !== 'transfer' || isDebtPayment) && t.amountCents !== 0,
                          })}
                        </td>
                        <td className="py-2 text-right">
                          <DeleteTransactionButton
                            transaction={{
                              id: t.id,
                              date: t.date,
                              description: t.description,
                              merchant: t.merchant,
                              type: t.type,
                              amountCents: t.amountCents,
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
