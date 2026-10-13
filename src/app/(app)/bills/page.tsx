import { requireUser } from "@/lib/auth/guard";
import { listBills } from "@/lib/repo/bills";
import { Card, CardBody, CardHeader, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Receipt, Plus } from "lucide-react";
import Link from "next/link";
import { formatMoney } from "@/lib/utils/money";

export const dynamic = "force-dynamic";

export default async function BillsPage() {
  const user = await requireUser();
  const bills = await listBills(user.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Bills & EMIs</h1>
          <p className="text-xs text-muted-foreground">Track recurring bills and loan payments</p>
        </div>
        <Button asChild>
          <Link href="/bills/new"><Plus className="h-4 w-4"/>Add bill</Link>
        </Button>
      </div>

      <Card>
        <CardHeader title="Bills" />
        <CardBody>
          {bills.length === 0 ? (
            <EmptyState icon={<Receipt className="h-6 w-6"/>} title="No bills yet" description="Add your recurring bills to get reminders and projections." action={<Button asChild><Link href="/bills/new">Add bill</Link></Button>} />
          ) : (
            <div className="divide-y divide-border">
              {bills.map(b => (
                <div key={b.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium">{b.name}</p>
                    <p className="text-xs text-muted-foreground">Due {b.dueDay} of month • {b.frequency}</p>
                  </div>
                  <p className="font-medium tabular-nums">{formatMoney(b.amountCents, { currency: user.currency })}</p>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
