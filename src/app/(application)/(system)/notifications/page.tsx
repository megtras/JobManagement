import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Bell } from "lucide-react";
import { NotificationsClient } from "@/components/notifications/NotificationsClient";

export default async function NotificationsPage() {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role ?? "TECHNICIAN";

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Bell className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
      </div>
      <NotificationsClient role={role} />
    </div>
  );
}
