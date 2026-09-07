import { prisma } from "@/lib/prisma";

async function nextNumber(current: number | undefined) {
  return (current ?? 0) + 1;
}

export async function nextStaffNo() {
  const latest = await prisma.user.findFirst({
    orderBy: { staffNo: "desc" },
    select: { staffNo: true },
  });
  return nextNumber(latest?.staffNo);
}

export async function nextCustomerNo() {
  const latest = await prisma.customer.findFirst({
    orderBy: { custNo: "desc" },
    select: { custNo: true },
  });
  return nextNumber(latest?.custNo);
}

export async function nextJobNo() {
  const latest = await prisma.appointment.findFirst({
    orderBy: { jobNo: "desc" },
    select: { jobNo: true },
  });
  return nextNumber(latest?.jobNo);
}
