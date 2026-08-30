import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAppointments } from "@/lib/actions/appointments";
import { getTeams } from "@/lib/actions/teams";
import { getJobCategories } from "@/lib/actions/inventory";
import { getCustomers } from "@/lib/actions/customers";
import { getBranches } from "@/lib/actions/users";
import { AppointmentsClient } from "@/components/appointments/AppointmentsClient";
import { mergeCustomerWorkLocations } from "@/lib/customer-work-locations";

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ urgent?: string; overdue?: string; sos?: string }>;
}) {
  const { urgent, overdue, sos } = await searchParams;
  const session = await getServerSession(authOptions);
  const isSupervisor = session!.user.role === "SUPERVISOR";
  const canManageCompletion = session!.user.role === "MANAGER" || session!.user.role === "SUPERVISOR";
  const canSchedulePastTime = session!.user.role === "ADMIN" || session!.user.role === "MANAGER" || session!.user.role === "SUPERVISOR";
  const initialUrgentOnly = urgent === "1";
  const initialOverdueOnly = overdue === "1";
  const initialSosOnly = sos === "1";

  const [rawAppts, rawCategories, rawCustomers, rawTeams, rawBranches] = await Promise.all([
    getAppointments(),
    getJobCategories(),
    getCustomers(),
    getTeams(),
    isSupervisor ? getBranches() : Promise.resolve([]),
  ]);

  // Serialize Decimals
  const appointments = rawAppts.map((a) => ({
    ...a,
    date: a.date.toISOString(),
    approvedAt: a.approvedAt ? a.approvedAt.toISOString() : null,
    checkInSosRequestedAt: a.checkInSosRequestedAt ? a.checkInSosRequestedAt.toISOString() : null,
    checkInSosResolvedAt: a.checkInSosResolvedAt ? a.checkInSosResolvedAt.toISOString() : null,
    billingType: a.billingType,
    warrantyNote: a.warrantyNote,
    totalPrice: parseFloat(a.totalPrice.toString()),
    commission: a.commission != null ? parseFloat(a.commission.toString()) : null,
    jobCategory: a.jobCategory ? { ...a.jobCategory, price: parseFloat(a.jobCategory.price.toString()) } : null,
    assets: a.assets.map((x) => ({
      ...x,
      unitPrice: parseFloat(x.unitPrice.toString()),
      jobCategory: x.jobCategory ? { ...x.jobCategory, price: parseFloat(x.jobCategory.price.toString()) } : null,
    })),
    payment: a.payments[0]
      ? {
          id: a.payments[0].id,
          status: a.payments[0].status as string,
          method: a.payments[0].method as string,
          receiptPhotoUrl: a.payments[0].receiptPhotoUrl,
        }
      : null,
    clockIn: a.clockInAt ? a.clockInAt.toISOString() : null,
    clockOut: a.clockOutAt ? a.clockOutAt.toISOString() : null,
  }));
  const categories = rawCategories.map((c) => ({
    id: c.id, name: c.name, price: parseFloat(c.price.toString()),
  }));
  const customers = rawCustomers.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    branchId: c.branchId,
    propertyType: c.propertyType,
    status: c.status,
    addresses: mergeCustomerWorkLocations(c, rawAppts),
  }));
  const teams = rawTeams.map((t) => ({
    id: t.id, name: t.name, branchId: t.branchId,
    members: t.members.map((m) => ({ id: m.id, name: m.name })),
  }));

  return (
    <AppointmentsClient
      appointments={appointments as Parameters<typeof AppointmentsClient>[0]["appointments"]}
      branches={rawBranches}
      categories={categories}
      customers={customers}
      teams={teams}
      isSupervisor={isSupervisor}
      canManageCompletion={canManageCompletion}
      canSchedulePastTime={canSchedulePastTime}
      initialUrgentOnly={initialUrgentOnly}
      initialOverdueOnly={initialOverdueOnly}
      initialSosOnly={initialSosOnly}
    />
  );
}
