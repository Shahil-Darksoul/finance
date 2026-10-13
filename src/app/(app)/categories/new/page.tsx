import { NewCategoryForm } from "@/components/app/new-category-form";

export const dynamic = "force-dynamic";

export default function NewCategoryPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <NewCategoryForm />
    </div>
  );
}