import "dotenv/config";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function ensureCategory(name: string, price: number) {
  const existing = await prisma.jobCategory.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.jobCategory.create({ data: { name, price, minEvidencePhotos: 3 } });
}

async function main() {
  const passwordHash = await bcrypt.hash("DemoOnly@1234", 12);

  let branch = await prisma.branch.findFirst({ where: { name: "Demo Branch" } });
  if (!branch) {
    branch = await prisma.branch.create({
      data: { name: "Demo Branch", address: "Local demo environment" },
    });
  }

  const users = [
    { name: "Demo Supervisor", email: "supervisor@demo.local", role: "SUPERVISOR" as const, branchId: null },
    { name: "Demo Manager", email: "manager@demo.local", role: "MANAGER" as const, branchId: branch.id },
    { name: "Demo Admin", email: "admin@demo.local", role: "ADMIN" as const, branchId: branch.id },
    { name: "Demo Technician One", email: "technician1@demo.local", role: "TECHNICIAN" as const, branchId: branch.id },
    { name: "Demo Technician Two", email: "technician2@demo.local", role: "TECHNICIAN" as const, branchId: branch.id },
  ];

  const savedUsers = [];
  for (const user of users) {
    savedUsers.push(await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        passwordHash,
        role: user.role,
        branchId: user.branchId,
        ...(user.role === "TECHNICIAN"
          ? { technicianStatus: "AVAILABLE" as const, position: "Technician" }
          : {}),
      },
      create: {
        ...user,
        passwordHash,
        ...(user.role === "TECHNICIAN"
          ? { technicianStatus: "AVAILABLE" as const, position: "Technician" }
          : {}),
      },
    }));
  }

  const technicians = savedUsers.filter((user) => user.role === "TECHNICIAN");
  const existingTeam = await prisma.team.findFirst({
    where: { name: "Demo Team", branchId: branch.id },
  });
  if (existingTeam) {
    await prisma.team.update({
      where: { id: existingTeam.id },
      data: { members: { set: technicians.map(({ id }) => ({ id })) } },
    });
  } else {
    await prisma.team.create({
      data: {
        name: "Demo Team",
        branchId: branch.id,
        members: { connect: technicians.map(({ id }) => ({ id })) },
      },
    });
  }

  await ensureCategory("Aircond Service", 80);
  await ensureCategory("Aircond Repair", 150);
  await ensureCategory("Aircond Installation", 350);

  console.log("Demo database seeded with fictional local-only accounts.");
  console.log("Password for every demo account: DemoOnly@1234");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
