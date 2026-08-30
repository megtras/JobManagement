import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const prismaSource = readFileSync(new URL("./prisma.ts", import.meta.url), "utf8");

test("development prisma client is refreshed when generated schema signature changes", () => {
  assert.match(prismaSource, /prismaSchemaSignature/);
  assert.match(prismaSource, /minEvidencePhotos/);
  assert.match(prismaSource, /servicePhotoLabel/);
  assert.match(prismaSource, /checkInSos/);
  assert.match(prismaSource, /globalForPrisma\.prismaSchemaSignature !== PRISMA_SCHEMA_SIGNATURE/);
  assert.match(prismaSource, /\$disconnect\(\)\.catch/);
});
