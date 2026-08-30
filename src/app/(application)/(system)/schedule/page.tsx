import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAppointments } from "@/lib/actions/appointments";
import { getTeams } from "@/lib/actions/teams";
import { getJobCategories } from "@/lib/actions/inventory";
import { getCustomers } from "@/lib/actions/customers";
import { getBranches } from "@/lib/actions/users";
import { ScheduleClient } from "@/components/schedule/ScheduleClient";
import { mergeCustomerWorkLocations } from "@/lib/customer-work-locations";

export default async function SchedulePage() {
  const session = await getServerSession(authOptions);
  const isSupervisor = session!.user.role === "SUPERVISOR";

  const [rawAppts, rawTeams, rawCategories, rawCustomers, rawBranches] = await Promise.all([
    getAppointments(),
    getTeams(),
    getJobCategories(),
    getCustomers(),
    isSupervisor ? getBranches() : Promise.resolve([]),
  ]);

  // Serialize Decimals before passing to client
  const appointments = rawAppts.map((a) => ({
    id: a.id,
    customerId: a.customerId,
    jobTitle: a.jobTitle,
    date: a.date.toISOString(),
    time: a.time,
    timeFinish: a.timeFinish,
    status: a.status,
    urgent: a.urgent ?? false,
    totalPrice: parseFloat(a.totalPrice.toString()),
    billingType: a.billingType,
    warrantyNote: a.warrantyNote,
    branchId: a.branchId,
    jobCategoryId: a.jobCategoryId,
    locationAddress: a.locationAddress,
    locationLat: a.locationLat,
    locationLng: a.locationLng,
    locationWazeLink: a.locationWazeLink,
    customer: { name: a.customer.name, phone: a.customer.phone },
    branch: { name: a.branch.name },
    jobCategory: a.jobCategory ? { name: a.jobCategory.name } : null,
    teams: a.teams.map((t) => ({ id: t.id, name: t.name, members: t.members.map((m) => ({ name: m.name })) })),
    assets: a.assets.map((x) => ({ label: x.label })),
  }));

  const teams = rawTeams.map((t) => ({
    id: t.id, name: t.name, branchId: t.branchId,
    members: t.members.map((m) => ({ id: m.id, name: m.name })),
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

  return (
    <ScheduleClient
      appointments={appointments}
      teams={teams}
      categories={categories}
      customers={customers}
      branches={rawBranches}
      isSupervisor={isSupervisor}
    />
  );
}
