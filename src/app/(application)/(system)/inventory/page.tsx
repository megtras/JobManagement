import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getJobCategories, getAssetTypePricing } from "@/lib/actions/inventory";
import { prisma } from "@/lib/prisma";
import { InventoryClient } from "@/components/inventory/InventoryClient";
import { AssetTypeMatrix } from "@/components/inventory/AssetTypeMatrix";

export default async function InventoryPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.role === "TECHNICIAN") redirect("/tasks");

  const [raw, pricing, acTypeUsage] = await Promise.all([
    getJobCategories(),
    getAssetTypePricing(),
    // acType is stored as a name snapshot on the asset, so usage is counted by
    // name rather than by a foreign key.
    prisma.appointmentAsset.groupBy({ by: ["acType"], _count: { _all: true } }),
  ]);

  // Prisma Decimal → plain number before crossing the Server→Client boundary
  const categories = raw.map((c) => ({
    id: c.id,
    name: c.name,
    price: parseFloat(c.price.toString()),
    minEvidencePhotos: c.minEvidencePhotos ?? 3,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  const usageByName = new Map(acTypeUsage.map((u) => [u.acType, u._count._all]));
  const assetTypes = pricing.assetTypes.map((t) => ({
    id: t.id,
    name: t.name,
    usageCount: usageByName.get(t.name) ?? 0,
  }));

  return (
    <>
      <InventoryClient categories={categories} />
      <AssetTypeMatrix
        assetTypes={assetTypes}
        categories={categories.map((c) => ({ id: c.id, name: c.name, price: c.price }))}
        prices={pricing.prices}
      />
    </>
  );
}
