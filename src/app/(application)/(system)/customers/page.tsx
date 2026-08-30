import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getCustomers } from "@/lib/actions/customers";
import { getBranches } from "@/lib/actions/users";
import { getJobCategories } from "@/lib/actions/inventory";
import { getAppointments } from "@/lib/actions/appointments";
import { getTeams } from "@/lib/actions/teams";
import { CustomersClient } from "@/components/customers/CustomersClient";
import { mergeCustomerWorkLocations } from "@/lib/customer-work-locations";
import { isServiceDue, serviceCompletedAt, serviceDueDate } from "@/lib/service-due";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceDue?: string }>;
}) {
  const { serviceDue } = await searchParams;
  const initialServiceDueOnly = serviceDue === "1";
  const session = await getServerSession(authOptions);
  const role = session!.user.role;
  const isSupervisor = role === "SUPERVISOR";

  const [rawCustomers, rawAppts, rawBranches, rawCategories, rawTeams] = await Promise.all([
    getCustomers(),
    getAppointments(),
    isSupervisor ? getBranches() : Promise.resolve([]),
    getJobCategories(),
    getTeams(),
  ]);

  const customers = rawCustomers.map((c) => {
    const { appointments, jobCategory, ...customer } = c;
    const latestDoneAppointment = appointments.find((a) => a.status === "DONE");
    const lastServiceAt = latestDoneAppointment ? serviceCompletedAt(latestDoneAppointment) : null;
    return {
      id: customer.id,
      custNo: customer.custNo,
      name: customer.name,
      custType: customer.custType,
      phone: customer.phone,
      phone2: customer.phone2,
      email: customer.email,
      area: customer.area,
      propertyType: customer.propertyType,
      jobCategoryId: customer.jobCategoryId,
      branchId: customer.branchId,
      status: customer.status,
      createdAt: customer.createdAt.toISOString(),
      branch: customer.branch,
      _count: customer._count,
      addresses: mergeCustomerWorkLocations(c, rawAppts),
      jobCategory: jobCategory ? { id: jobCategory.id, name: jobCategory.name, price: parseFloat(jobCategory.price.toString()) } : null,
      serviceDue: latestDoneAppointment ? isServiceDue(latestDoneAppointment) : false,
      lastServiceAt: lastServiceAt ? lastServiceAt.toISOString() : null,
      nextServiceDueAt: lastServiceAt ? serviceDueDate(lastServiceAt).toISOString() : null,
      serviceHistory: appointments.map((a) => ({
        id: a.id,
        jobNo: a.jobNo,
        jobTitle: a.jobTitle,
        date: a.date.toISOString(),
        time: a.time,
        timeFinish: a.timeFinish,
        status: a.status,
        totalPrice: parseFloat(a.totalPrice.toString()),
        billingType: a.billingType,
        warrantyNote: a.warrantyNote,
        jobCategory: a.jobCategory,
        teams: a.teams.map((t) => ({ name: t.name })),
        assets: a.assets.map((asset) => ({
          acType: asset.acType,
          remarks: asset.remarks,
          technicianRemark: asset.technicianRemark,
          jobCategory: asset.jobCategory,
        })),
      })),
    };
  });
  const categories = rawCategories.map((c) => ({
    id: c.id, name: c.name, price: parseFloat(c.price.toString()),
  }));
  const teams = rawTeams.map((t) => ({
    id: t.id, name: t.name, branchId: t.branchId,
    members: t.members.map((m) => ({ id: m.id, name: m.name })),
  }));

  return (
    <CustomersClient
      customers={customers as Parameters<typeof CustomersClient>[0]["customers"]}
      branches={rawBranches}
      categories={categories}
      teams={teams}
      isSupervisor={isSupervisor}
      userBranchId={session!.user.branchId}
      initialServiceDueOnly={initialServiceDueOnly}
    />
  );
}
