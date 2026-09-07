-- Asset types become managed data instead of a hardcoded list in the
-- appointment form, and each (asset type x job category) pair can carry its
-- own price.
--
-- AppointmentAsset.acType stays a plain string: it is a snapshot of what was
-- sold, so renaming or deleting a type later must not rewrite history.

-- CreateTable
CREATE TABLE "AssetType" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AssetTypePrice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetTypeId" TEXT NOT NULL,
    "jobCategoryId" TEXT NOT NULL,
    "price" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssetTypePrice_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "AssetType" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AssetTypePrice_jobCategoryId_fkey" FOREIGN KEY ("jobCategoryId") REFERENCES "JobCategory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetType_name_key" ON "AssetType"("name");
CREATE UNIQUE INDEX "AssetTypePrice_assetTypeId_jobCategoryId_key" ON "AssetTypePrice"("assetTypeId", "jobCategoryId");
CREATE INDEX "AssetTypePrice_jobCategoryId_idx" ON "AssetTypePrice"("jobCategoryId");

-- Seed the five types the form used to hardcode, preserving their order.
INSERT OR IGNORE INTO "AssetType" ("id", "name", "sortOrder", "updatedAt") VALUES
  ('asset-type-wall-mounted', 'Wall Mounted', 1, CURRENT_TIMESTAMP),
  ('asset-type-cassette',     'Cassette',     2, CURRENT_TIMESTAMP),
  ('asset-type-exposed',      'Exposed',      3, CURRENT_TIMESTAMP),
  ('asset-type-ducting',      'Ducting',      4, CURRENT_TIMESTAMP),
  ('asset-type-wiring',       'Wiring',       5, CURRENT_TIMESTAMP);

-- Pre-fill the matrix from each category's existing price so behaviour is
-- unchanged on day one; staff then adjust individual cells.
INSERT OR IGNORE INTO "AssetTypePrice" ("id", "assetTypeId", "jobCategoryId", "price", "updatedAt")
SELECT
  t."id" || '-' || c."id",
  t."id",
  c."id",
  c."price",
  CURRENT_TIMESTAMP
FROM "AssetType" t
CROSS JOIN "JobCategory" c;
