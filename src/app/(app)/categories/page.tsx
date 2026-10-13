import { requireUser } from "@/lib/auth/guard";
import { listCategories } from "@/lib/repo/categories";
import { Card, CardBody, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tag, Plus } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const user = await requireUser();
  const categories = await listCategories(user.id);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Categories</h1>
          <p className="text-xs text-muted-foreground">Organize transactions by category</p>
        </div>
        <Button asChild><Link href="/categories/new"><Plus className="h-4 w-4"/>Add category</Link></Button>
      </div>

      <Card>
        <CardBody>
          {categories.length === 0 ? (
            <EmptyState icon={<Tag className="h-6 w-6"/>} title="No categories yet" description="Create categories to better track spending." action={<Button asChild><Link href="/categories/new">Add category</Link></Button>} />
          ) : (
            <div className="divide-y divide-border">
              {categories.map(c => (
                <div key={c.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-2">
                    {c.color && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />}
                    <p className="font-medium">{c.name}</p>
                    <span className="text-xs text-muted-foreground capitalize">{c.kind}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
