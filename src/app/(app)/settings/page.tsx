import { requireUser } from "@/lib/auth/guard";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { clearDemoData } from "@/lib/services/finance/demo";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { listPaydays } from "@/lib/repo/paydays";
import { listAccounts } from "@/lib/repo/accounts";
import { DEPOSIT_ACCOUNT_TYPES } from "@/lib/types";
import { PaydayManager } from "@/components/app/payday-manager";
import { getMarketSettingsView } from "@/lib/services/marketData/settings";
import { MarketDataSettings } from "@/components/app/market-data-settings";
import { DEFAULT_CURRENCY } from "@/lib/utils/currency";

export const dynamic = "force-dynamic";

async function clearDemoAction() {
  'use server';
  const user = await requireUser();
  await clearDemoData(user.id);
  revalidatePath('/dashboard');
  redirect('/dashboard');
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const tab = params.tab ?? "profile";

  const showPaydays = tab === "paydays";
  const [paydays, depositAccounts] = showPaydays
    ? await Promise.all([listPaydays(user.id), listAccounts(user.id)])
    : [[], []];
  const accounts = depositAccounts
    .filter((account) => DEPOSIT_ACCOUNT_TYPES.includes(account.type))
    .map((account) => ({ id: account.id, name: account.name }));

  const marketSettings = await getMarketSettingsView(user.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-xs text-muted-foreground">Manage your account and data</p>
      </div>

      <Card>
        <CardHeader title="Profile" />
        <CardBody>
          <div className="space-y-2 text-sm">
            <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{user.name}</span></div>
            <div><span className="text-muted-foreground">Email:</span> <span className="font-medium">{user.email}</span></div>
            <div>
              <span className="text-muted-foreground">Currency:</span>{" "}
              <span className="font-medium">{DEFAULT_CURRENCY}</span>
            </div>
            {user.isDemo && <div className="text-xs text-warning">Demo account</div>}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Market data"
          description="Live stock and crypto prices. Add your own API key for real quotes; without one the app uses a built-in simulator."
        />
        <CardBody>
          <MarketDataSettings initial={marketSettings} />
        </CardBody>
      </Card>

      {tab === "paydays" ? (
        <Card>
          <CardHeader
            title="Paydays"
            description="Your income schedule — each entry repeats on your calendar and feeds the paycheck projection."
          />
          <CardBody>
            <PaydayManager paydays={paydays} accounts={accounts} currency={DEFAULT_CURRENCY} />
          </CardBody>
        </Card>
      ) : null}

      {user.isDemo && (
        <Card>
          <CardHeader title="Demo Data" description="Clear the fictional dataset from this account" />
          <CardBody>
            <form action={clearDemoAction}>
              <Button variant="danger" type="submit">
                <Trash2 className="h-4 w-4" />
                Clear demo data
              </Button>
            </form>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Data Export/Import" description="Your data stays on your device" />
        <CardBody>
          <p className="text-sm text-muted-foreground">CSV import/export features can be added here. All data is stored in your local database.</p>
        </CardBody>
      </Card>
    </div>
  );
}
