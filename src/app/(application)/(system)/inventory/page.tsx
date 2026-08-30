import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getJobCategories } from "@/lib/actions/inventory";
import { InventoryClient } from "@/components/inventory/InventoryClient";

export default async function InventoryPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role === "TECHNICIAN") redirect("/tasks");

  const raw = await getJobCategories();

  // Prisma Decimal → plain number before crossing the Server→Client boundary
  const categories = raw.map((c) => ({
    id: c.id,
    name: c.name,
    price: parseFloat(c.price.toString()),
    minEvidencePhotos: c.minEvidencePhotos ?? 3,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return <InventoryClient categories={categories} />;
}
