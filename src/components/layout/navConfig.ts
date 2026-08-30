import type { Role } from "@/generated/prisma/client";
import {
  LayoutDashboard,
  Users,
  UsersRound,
  CalendarDays,
  Calendar,
  // CreditCard, // hidden: Payments menu disabled for now
  UserCog,
  Package,
  ClipboardList,
  Building2,
  Target,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

// Supervisor, Manager and Admin share the same menu. The data each one sees is
// scoped to their branch server-side (Supervisor sees all branches).
const STAFF_NAV: NavItem[] = [
  { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/app/customers", label: "Customers", icon: Users },
  { href: "/app/appointments", label: "Appointments", icon: CalendarDays },
  { href: "/app/schedule", label: "Schedule", icon: Calendar },
  // { href: "/payments", label: "Payments", icon: CreditCard }, // hidden for now — re-enable when needed
  { href: "/app/teams", label: "Teams & Technicians", icon: UsersRound },
  { href: "/app/users", label: "Users", icon: UserCog },
  { href: "/app/inventory", label: "Inventory", icon: Package },
  { href: "/app/branches", label: "Branches", icon: Building2 },
  { href: "/app/website-leads", label: "Website Leads", icon: Target },
];

export const NAV_ITEMS: Record<Role, NavItem[]> = {
  SUPERVISOR: STAFF_NAV,
  MANAGER: STAFF_NAV,
  ADMIN: STAFF_NAV,
  TECHNICIAN: [
    { href: "/app/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/app/tasks", label: "Team Tasks", icon: ClipboardList },
  ],
};
