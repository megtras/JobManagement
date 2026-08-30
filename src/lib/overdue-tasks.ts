import { prisma } from "@/lib/prisma";

const OVERDUE_TASK_TYPE = "OVERDUE_TASK";

export function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function notifyOverdueTasksForReschedule() {
  const today = startOfToday();
  const overdueAppointments = await prisma.appointment.findMany({
    where: {
      status: { in: ["COMING_SOON", "IN_PROGRESS"] },
      date: { lt: today },
    },
    select: {
      id: true,
      jobNo: true,
      branchId: true,
      customer: { select: { name: true, phone: true } },
      teams: { select: { name: true } },
    },
  });

  for (const appt of overdueAppointments) {
    const recipients = await prisma.user.findMany({
      where: {
        OR: [
          { role: { in: ["ADMIN", "MANAGER"] }, branchId: appt.branchId },
          { role: "SUPERVISOR" },
        ],
      },
      select: { id: true },
    });
    if (recipients.length === 0) continue;

    const recipientIds = recipients.map((recipient) => recipient.id);
    const existingNotifications = await prisma.notification.findMany({
      where: {
        type: OVERDUE_TASK_TYPE,
        relatedAppointmentId: appt.id,
        userId: { in: recipientIds },
      },
      select: { userId: true },
    });
    const existingRecipientIds = new Set(existingNotifications.map((notification) => notification.userId));
    const newRecipients = recipients.filter((recipient) => !existingRecipientIds.has(recipient.id));
    if (newRecipients.length === 0) continue;

    const who = appt.customer.name || appt.customer.phone || "Customer";
    const teamName = appt.teams.map((team) => team.name).join(", ");
    const jobLabel = `GP-${String(appt.jobNo).padStart(4, "0")}`;
    const message = `Overdue task ${jobLabel} (${who})${teamName ? ` - team ${teamName}` : ""} needs reschedule. Scheduled date has passed and the job is not completed.`;

    await prisma.notification.createMany({
      data: newRecipients.map((recipient) => ({
        userId: recipient.id,
        type: OVERDUE_TASK_TYPE,
        message,
        relatedAppointmentId: appt.id,
      })),
    });
  }
}
