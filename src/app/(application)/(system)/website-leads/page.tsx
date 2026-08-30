import { getServerSession } from "next-auth";
import { WebsiteLeadsClient } from "@/components/website-leads/WebsiteLeadsClient";
import { getAppointments } from "@/lib/actions/appointments";
import { getCustomers } from "@/lib/actions/customers";
import { getJobCategories } from "@/lib/actions/inventory";
import { getTeams } from "@/lib/actions/teams";
import { getBranches } from "@/lib/actions/users";
import { getWebsiteLeads } from "@/lib/actions/website-leads";
import { authOptions } from "@/lib/auth";
import { mergeCustomerWorkLocations } from "@/lib/customer-work-locations";

export default async function WebsiteLeadsPage() {
  const session = await getServerSession(authOptions);
  const isSupervisor = session!.user.role === "SUPERVISOR";
  const [leads, rawCustomers, rawAppointments, branches, rawCategories, rawTeams] =
    await Promise.all([
      getWebsiteLeads(),
      getCustomers(),
      getAppointments(),
      isSupervisor ? getBranches() : Promise.resolve([]),
      getJobCategories(),
      getTeams(),
    ]);

  const customers = rawCustomers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    phone: customer.phone,
    branchId: customer.branchId,
    propertyType: customer.propertyType,
    status: customer.status,
    addresses: mergeCustomerWorkLocations(customer, rawAppointments),
  }));
  const categories = rawCategories.map((category) => ({
    id: category.id,
    name: category.name,
    price: Number(category.price),
  }));
  const teams = rawTeams.map((team) => ({
    id: team.id,
    name: team.name,
    branchId: team.branchId,
    members: team.members.map((member) => ({
      id: member.id,
      name: member.name,
    })),
  }));

  return (
    <WebsiteLeadsClient
      leads={leads}
      branches={branches}
      customers={customers}
      categories={categories}
      teams={teams}
      defaultBranchId={session!.user.branchId ?? branches[0]?.id ?? null}
    />
  );
}
