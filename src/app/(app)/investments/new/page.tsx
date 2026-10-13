import { requireUser } from "@/lib/auth/guard";
import { listAccounts } from "@/lib/repo/accounts";
import { NewInvestmentForm } from "@/components/app/new-investment-form";

export const dynamic = "force-dynamic";

export default async function NewInvestmentPage() {
  const user = await requireUser();
  const accounts = await listAccounts(user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <NewInvestmentForm
        accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
        currency={user.currency}
      />
    </div>
  );
}