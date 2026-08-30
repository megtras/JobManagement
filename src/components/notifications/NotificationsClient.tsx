"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell, CheckCircle2, XCircle, FileText, DollarSign,
  Loader2, AlertCircle, AlertTriangle, Check, ExternalLink, CalendarClock,
} from "lucide-react";

interface NotificationItem {
  id: string;
  type: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  relatedAppointment: {
    id: string;
    customer: { name: string };
  } | null;
}

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  PAYMENT_SUBMITTED: { icon: DollarSign,    color: "text-amber-500" },
  PAYMENT_APPROVED:  { icon: CheckCircle2,  color: "text-green-500" },
  PAYMENT_REJECTED:  { icon: XCircle,       color: "text-red-500"   },
  REPORT_SUBMITTED:  { icon: FileText,      color: "text-blue-500"  },
  URGENT_TASK:       { icon: AlertTriangle, color: "text-red-600"   },
  SOS_CHECKIN:       { icon: AlertTriangle, color: "text-red-600"   },
  OVERDUE_TASK:      { icon: AlertTriangle, color: "text-amber-600" },
  SERVICE_DUE:       { icon: CalendarClock, color: "text-teal-600"  },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationsClient({ role }: { role: string }) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [marking, setMarking] = useState(false);
  const [error, setError] = useState("");

  // Technician links to /tasks/[id], everyone else to /appointments/[id]
  const detailHref = (appointmentId: string, type: string) =>
    role === "TECHNICIAN"
      ? `/tasks/${appointmentId}`
      : type === "SOS_CHECKIN"
        ? "/appointments?sos=1"
        : type === "SERVICE_DUE"
          ? "/customers?serviceDue=1"
          : `/appointments/${appointmentId}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setItems(data.notifications);
      setError("");
    } catch {
      setError("Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markAllRead = async () => {
    setMarking(true);
    try {
      await fetch("/api/notifications", { method: "PATCH" });
      setItems([]);
    } finally {
      setMarking(false);
    }
  };

  const viewNotification = async (notification: NotificationItem) => {
    if (!notification.relatedAppointment) return;
    const href = notification.type === "SOS_CHECKIN"
      ? "/appointments?sos=1"
      : notification.type === "SERVICE_DUE"
        ? "/customers?serviceDue=1"
      : detailHref(notification.relatedAppointment.id, notification.type);

    try {
      const res = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: notification.id }),
      });
      if (!res.ok) throw new Error("Failed");
      setItems((prev) => prev.filter((n) => n.id !== notification.id));
      setError("");
      router.push(href);
    } catch {
      setError("Could not open notification.");
    }
  };

  const unreadCount = items.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {unreadCount > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">{unreadCount} unread</span>
          <button
            onClick={markAllRead}
            disabled={marking}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
          >
            {marking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Mark all as read
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {items.length === 0 && !error ? (
        <div className="text-center py-16 text-gray-400">
          <Bell className="w-10 h-10 mx-auto mb-3 text-gray-300" />
          <p className="font-medium text-gray-500">No notifications yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const cfg = TYPE_CONFIG[n.type] ?? { icon: Bell, color: "text-gray-400" };
            const Icon = cfg.icon;

            return (
              <div
                key={n.id}
                className={`bg-white rounded-xl border p-4 flex items-start gap-3 ${
                  n.isRead ? "border-gray-200" : "border-blue-200 bg-blue-50/30"
                }`}
              >
                <div className={`mt-0.5 shrink-0 ${cfg.color}`}>
                  <Icon className="w-5 h-5" />
                </div>

                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${n.isRead ? "text-gray-600" : "text-gray-900 font-medium"}`}>
                    {n.message}
                  </p>
                  {n.relatedAppointment && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      {n.relatedAppointment.customer.name}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-gray-400">{timeAgo(n.createdAt)}</span>
                    {n.relatedAppointment && (
                      <button
                        type="button"
                        onClick={() => viewNotification(n)}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium"
                      >
                        View
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                {!n.isRead && (
                  <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
