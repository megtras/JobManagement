type EvidencePhoto = { type: string; assetId?: string | null };
type EvidenceAsset = { id: string; jobCategory?: { minEvidencePhotos?: number | null } | null };

export function evidenceRequirementForAsset(asset: EvidenceAsset, fallbackEvidencePhotos: number) {
  return Math.max(3, Number(asset.jobCategory?.minEvidencePhotos ?? fallbackEvidencePhotos));
}

export function validateTaskEvidenceReady(
  task: { assets: EvidenceAsset[]; servicePhotos: EvidencePhoto[] },
  minEvidencePhotos: number
) {
  const fallbackEvidencePhotos = Math.max(3, minEvidencePhotos);
  const evidencePhotos = task.servicePhotos.filter((photo) => photo.type === "EVIDENCE");

  if (task.assets.length === 0) {
    return evidencePhotos.length >= fallbackEvidencePhotos
      ? null
      : `Please take at least ${fallbackEvidencePhotos} evidence photos before continuing.`;
  }

  const incompleteAsset = task.assets.find((asset) =>
    evidencePhotos.filter((photo) => photo.assetId === asset.id).length < evidenceRequirementForAsset(asset, fallbackEvidencePhotos)
  );

  return incompleteAsset
    ? `Please take at least ${evidenceRequirementForAsset(incompleteAsset, fallbackEvidencePhotos)} evidence photos for every asset before continuing.`
    : null;
}
