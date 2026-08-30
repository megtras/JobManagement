import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LayoutDashboard } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { TechnicianDashboard } from "@/components/dashboard/TechnicianDashboard";
import { notifyOverdueTasksForReschedule, startOfToday } from "@/lib/overdue-tasks";
import { technicianTeamAccessWhere } from "@/lib/task-access";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  if (role === "TECHNICIAN") {
    const today = startOfToday();
    await notifyOverdueTasksForReschedule();

    const appts = await prisma.appointment.findMany({
      where: {
        ...technicianTeamAccessWhere(session!.user.id, session!.user.name),
        OR: [
          { status: { in: ["COMING_SOON", "IN_PROGRESS"] }, date: { gte: today } },
          { status: "DONE" },
        ],
      },
      select: {
        id: true, jobNo: true, jobTitle: true, status: true, date: true, totalPrice: true, billingType: true, warrantyNote: true, urgent: true,
        customer: { select: { name: true } },
        jobCategory: { select: { name: true } },
      },
      orderBy: { date: "desc" },
    });

    const tasks = appts
      .map((a) => ({
        id: a.id, jobNo: a.jobNo, jobTitle: a.jobTitle || null, customer: a.customer.name,
        jobCategory: a.jobCategory?.name ?? null,
        status: a.status,
        urgent: a.urgent ?? false,
        date: a.date.toISOString(), totalPrice: Number(a.totalPrice), billingType: a.billingType, warrantyNote: a.warrantyNote,
      }));

    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <LayoutDashboard className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        </div>
        <TechnicianDashboard userName={session!.user.name ?? "there"} tasks={tasks} />
      </div>
    );
  }

  return (
    <div>
      <DashboardClient
        userName={session?.user?.name ?? "there"}
        isSupervisor={session?.user?.role === "SUPERVISOR"}
      />
    </div>
  );
}
