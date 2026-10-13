import { requireUser } from "@/lib/auth/guard";
import { listAccounts } from "@/lib/repo/accounts";
import { listCategories } from "@/lib/repo/categories";
import { NewBillForm } from "@/components/app/new-bill-form";

export const dynamic = "force-dynamic";

export default async function NewBillPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const user = await requireUser();
  const { kind } = await searchParams;

  const [accounts, categories] = await Promise.all([
    listAccounts(user.id),
    listCategories(user.id, "expense"),
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <NewBillForm
        accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
        categories={categories.map((category) => ({ id: category.id, name: category.name }))}
        currency={user.currency}
        defaultKind={kind === "emi" ? "emi" : "bill"}
      />
    </div>
  );
}