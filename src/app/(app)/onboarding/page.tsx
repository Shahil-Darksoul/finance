import { requireUser } from "@/lib/auth/guard";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  await requireUser();
  return (
    <Card>
      <CardHeader title="Getting Started" description="Set up Ledgerly in a few steps" />
      <CardBody className="space-y-3">
        <p className="text-sm text-muted-foreground">Complete these steps to get the most out of Ledgerly.</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/accounts/new">Add your first account</Link></Button>
          <Button asChild variant="outline"><Link href="/categories">Set up categories</Link></Button>
          <Button asChild variant="outline"><Link href="/bills/new">Add bills</Link></Button>
          <Button asChild variant="outline"><Link href="/settings?tab=paydays">Set up paydays</Link></Button>
        </div>
      </CardBody>
    </Card>
  );
}
