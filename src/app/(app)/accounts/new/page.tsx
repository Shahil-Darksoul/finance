import { requireUser } from "@/lib/auth/guard";
import { NewAccountForm } from "@/components/app/new-account-form";

export const dynamic = "force-dynamic";

export default async function NewAccountPage() {
  const user = await requireUser();

  return (
    <div className="mx-auto max-w-2xl">
      <NewAccountForm currency={user.currency} />
    </div>
  );
}