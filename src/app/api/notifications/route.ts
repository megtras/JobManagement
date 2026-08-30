import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyOverdueTasksForReschedule } from "@/lib/overdue-tasks";
import { notifyServiceDueCustomers } from "@/lib/service-due";

// GET: list active notifications + unread count
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (session.user.role !== "TECHNICIAN") {
    await notifyOverdueTasksForReschedule();
    await notifyServiceDueCustomers();
  }

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id, isRead: false },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      relatedAppointment: {
        select: { id: true, customer: { select: { name: true } } },
      },
    },
  });

  const unreadCount = notifications.length;

  return NextResponse.json({ notifications, unreadCount });
}

// PATCH: mark one notification or all notifications as read
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { notificationId?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const notificationId = typeof body.notificationId === "string" ? body.notificationId : "";

  if (notificationId) {
    await prisma.notification.updateMany({
      where: { id: notificationId, userId: session.user.id },
      data: { isRead: true },
    });

    return NextResponse.json({ ok: true });
  }

  await prisma.notification.updateMany({
    where: { userId: session.user.id, isRead: false },
    data: { isRead: true },
  });

  return NextResponse.json({ ok: true });
}
