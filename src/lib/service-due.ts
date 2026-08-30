import { prisma } from "@/lib/prisma";
import { startOfToday } from "@/lib/overdue-tasks";

export const SERVICE_DUE_TYPE = "SERVICE_DUE";
export const SERVICE_DUE_MONTHS = 6;

type CompletedServiceDateSource = {
  date: Date;
  approvedAt: Date | null;
  clockOutAt: Date | null;
};

type ServiceDueScope = {
  branchId?: string | null;
};

export type ServiceDueCustomerSummary = {
  appointmentId: string;
  jobNo: number;
  customerId: string;
  customerName: string;
  customerPhone: string;
  branchId: string;
  completedAt: Date;
  dueAt: Date;
};

export function serviceCompletedAt(appointment: CompletedServiceDateSource) {
  return appointment.clockOutAt ?? appointment.approvedAt ?? appointment.date;
}

export function serviceDueDate(completedAt: Date) {
  const due = new Date(completedAt);
  due.setMonth(due.getMonth() + SERVICE_DUE_MONTHS);
  return due;
}

export function isServiceDue(appointment: CompletedServiceDateSource, today = startOfToday()) {
  return serviceDueDate(serviceCompletedAt(appointment)) <= today;
}

export async function getServiceDueCustomerSummaries(scope: ServiceDueScope = {}) {
  const today = startOfToday();
  const appointments = await prisma.appointment.findMany({
    where: {
      status: "DONE",
      ...(scope.branchId ? { branchId: scope.branchId } : {}),
    },
    orderBy: [{ customerId: "asc" }, { clockOutAt: "desc" }, { date: "desc" }],
    select: {
      id: true,
      jobNo: true,
      customerId: true,
      branchId: true,
      date: true,
      approvedAt: true,
      clockOutAt: true,
      customer: { select: { name: true, phone: true } },
    },
  });

  const latestByCustomer = new Map<string, (typeof appointments)[number]>();
  for (const appointment of appointments) {
    if (latestByCustomer.has(appointment.customerId)) continue;
    latestByCustomer.set(appointment.customerId, appointment);
  }

  const summaries: ServiceDueCustomerSummary[] = [];
  for (const appointment of latestByCustomer.values()) {
    const completedAt = serviceCompletedAt(appointment);
    const dueAt = serviceDueDate(completedAt);
    if (!(serviceDueDate(completedAt) <= today)) continue;
    summaries.push({
      appointmentId: appointment.id,
      jobNo: appointment.jobNo,
      customerId: appointment.customerId,
      customerName: appointment.customer.name,
      customerPhone: appointment.customer.phone,
      branchId: appointment.branchId,
      completedAt,
      dueAt,
    });
  }

  return summaries.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

export async function notifyServiceDueCustomers(scope: ServiceDueScope = {}) {
  const summaries = await getServiceDueCustomerSummaries(scope);

  for (const summary of summaries) {
    const recipients = await prisma.user.findMany({
      where: {
        OR: [
          { role: { in: ["ADMIN", "MANAGER"] }, branchId: summary.branchId },
          { role: "SUPERVISOR" },
        ],
      },
      select: { id: true },
    });
    if (recipients.length === 0) continue;

    const recipientIds = recipients.map((recipient) => recipient.id);
    const existingNotifications = await prisma.notification.findMany({
      where: {
        type: SERVICE_DUE_TYPE,
        relatedAppointmentId: summary.appointmentId,
        userId: { in: recipientIds },
      },
      select: { userId: true },
    });
    const existingRecipientIds = new Set(existingNotifications.map((notification) => notification.userId));
    const newRecipients = recipients.filter((recipient) => !existingRecipientIds.has(recipient.id));
    if (newRecipients.length === 0) continue;

    const jobLabel = `GP-${String(summary.jobNo).padStart(4, "0")}`;
    const completedDate = summary.completedAt.toLocaleDateString("en-MY", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const message = `Service due reminder for ${summary.customerName || summary.customerPhone}. Last service ${jobLabel} was completed on ${completedDate}. Please contact the customer to schedule maintenance.`;

    await prisma.notification.createMany({
      data: newRecipients.map((recipient) => ({
        userId: recipient.id,
        type: SERVICE_DUE_TYPE,
        message,
        relatedAppointmentId: summary.appointmentId,
      })),
    });
  }

  return summaries;
}
