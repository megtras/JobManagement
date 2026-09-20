import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppointmentDetailClient } from "@/components/appointments/AppointmentDetailClient";
import { getJobCategories } from "@/lib/actions/inventory";
import { getCustomers } from "@/lib/actions/customers";
import { getTeams } from "@/lib/actions/teams";
import { getAppointments } from "@/lib/actions/appointments";
import { mergeCustomerWorkLocations } from "@/lib/customer-work-locations";

export default async function AppointmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role === "TECHNICIAN") redirect("/");

  const role = session.user.role;
  const canApprovePayments = role === "ADMIN" || role === "MANAGER" || role === "SUPERVISOR";
  const canEditReport = role === "ADMIN" || role === "MANAGER" || role === "SUPERVISOR";
  const canManage = role === "MANAGER" || role === "SUPERVISOR";

  // Data needed to create a sub job inline (managers/supervisors only).
  const [rawCategories, rawCustomers, rawAppts, rawTeams] = await Promise.all([
    canEditReport ? getJobCategories() : [],
    canManage ? getCustomers() : [],
    canManage ? getAppointments() : [],
    canManage ? getTeams() : [],
  ]);

  const categories = rawCategories.map((c) => ({ id: c.id, name: c.name, price: parseFloat(c.price.toString()) }));
  const customers = rawCustomers.map((c) => ({
    id: c.id, name: c.name, phone: c.phone, branchId: c.branchId, propertyType: c.propertyType, status: c.status,
    addresses: mergeCustomerWorkLocations(c, rawAppts),
  }));
  const teams = rawTeams.map((t) => ({
    id: t.id, name: t.name, branchId: t.branchId,
    members: t.members.map((m) => ({ id: m.id, name: m.name })),
  }));

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link href="/appointments" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">Appointment Detail</h1>
      </div>
      <AppointmentDetailClient
        appointmentId={id}
        canApprovePayments={canApprovePayments}
        canEditReport={canEditReport}
        canManage={canManage}
        categories={categories}
        customers={customers}
        teams={teams}
      />
    </div>
  );
}
