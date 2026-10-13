import { requireUser } from "@/lib/auth/guard";
import { listAccounts } from "@/lib/repo/accounts";
import { NewGoalForm } from "@/components/app/new-goal-form";

export const dynamic = "force-dynamic";

export default async function NewGoalPage() {
  const user = await requireUser();
  const accounts = await listAccounts(user.id);

  return (
    <div className="mx-auto max-w-2xl">
      <NewGoalForm accounts={accounts.map((account) => ({ id: account.id, name: account.name }))} />
    </div>
  );
}