export type AssetBillingType = "CHARGEABLE" | "WARRANTY";

export type PriceAsset = {
  unitPrice: number | string | { toString(): string };
  billingType?: AssetBillingType | null;
};

export function isTroubleshootCategoryName(name?: string | null) {
  return (name ?? "").trim().toLowerCase().includes("troubleshoot");
}

export function calculateChargeableAssetTotal(assets: PriceAsset[]) {
  return assets
    .filter((asset) => asset.billingType === "CHARGEABLE" || !asset.billingType)
    .reduce((sum, asset) => sum + (Number(asset.unitPrice) || 0), 0);
}
