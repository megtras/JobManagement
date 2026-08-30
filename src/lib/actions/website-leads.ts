"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { WebsiteLeadStatus } from "@/generated/prisma/client";

const STATUSES: WebsiteLeadStatus[] = [
  "NEW_ENQUIRY",
  "CONTACTED",
  "QUALIFIED",
  "QUOTATION_SENT",
  "APPOINTMENT_CONFIRMED",
  "CONVERTED_TO_JOB",
  "JOB_COMPLETED",
  "CLOSED",
];

async function requireManagementUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role === "TECHNICIAN") {
    throw new Error("Unauthorized");
  }
  return session;
}

export async function getWebsiteLeads() {
  await requireManagementUser();
  return prisma.websiteLead.findMany({
    include: {
      messages: {
        orderBy: { receivedAt: "desc" },
        take: 20,
      },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

export async function updateWebsiteLeadStatus(
  id: string,
  status: WebsiteLeadStatus
) {
  await requireManagementUser();
  if (!STATUSES.includes(status)) throw new Error("Invalid lead status.");

  await prisma.websiteLead.update({
    where: { id },
    data: { status },
  });
  revalidatePath("/website-leads");
}

export async function linkWebsiteLeadCustomer(
  leadId: string,
  customerId: string
) {
  const session = await requireManagementUser();
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, branchId: true },
  });
  if (!customer) throw new Error("Customer not found.");
  if (
    session.user.role !== "SUPERVISOR" &&
    customer.branchId !== session.user.branchId
  ) {
    throw new Error("Unauthorized");
  }

  await prisma.websiteLead.update({
    where: { id: leadId },
    data: { customerId, status: "CONTACTED" },
  });
  revalidatePath("/website-leads");
}

export async function linkWebsiteLeadAppointment(
  leadId: string,
  appointmentId: string
) {
  const session = await requireManagementUser();
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { customerId: true, branchId: true },
  });
  if (!appointment) throw new Error("Appointment not found.");
  if (
    session.user.role !== "SUPERVISOR" &&
    appointment.branchId !== session.user.branchId
  ) {
    throw new Error("Unauthorized");
  }

  await prisma.websiteLead.update({
    where: { id: leadId },
    data: {
      customerId: appointment.customerId,
      appointmentId,
      status: "APPOINTMENT_CONFIRMED",
    },
  });
  revalidatePath("/website-leads");
}
