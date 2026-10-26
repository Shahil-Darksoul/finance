import { requireUser } from "@/lib/auth/guard";
import { listAccounts } from "@/lib/repo/accounts";
import { listCategories } from "@/lib/repo/categories";
import { NewTransactionForm } from "@/components/app/new-transaction-form";

export const dynamic = "force-dynamic";

export default async function NewTransactionPage() {
  const user = await requireUser();
  const [accounts, categories] = await Promise.all([
    listAccounts(user.id),
    listCategories(user.id),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <NewTransactionForm
        accounts={accounts.map((account) => ({
          id: account.id,
          name: account.name,
          type: account.type,
          currentBalanceCents: account.currentBalanceCents,
        }))}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
      />
    </div>
  );
}