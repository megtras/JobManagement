import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const prismaSource = readFileSync(new URL("./prisma.ts", import.meta.url), "utf8");

test("Prisma is created lazily from the Job Management D1 binding", () => {
  assert.match(prismaSource, /getCloudflareContext/);
  assert.match(prismaSource, /new PrismaD1\(env\.DB\)/);
  assert.match(prismaSource, /function getClient\(\)/);
  assert.match(prismaSource, /globalForPrisma\.prisma = createClient\(\)/);
  assert.match(prismaSource, /export const prisma = new Proxy/);
});
