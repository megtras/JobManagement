"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { Role, CustomerType, PropertyType } from "@/generated/prisma/client";
import { nextCustomerNo } from "@/lib/record-numbers";

const CUST_TYPES: CustomerType[] = ["CORPORATE", "END_USER"];
const PROPERTY_TYPES: PropertyType[] = ["CONDO", "LANDED", "OFFICE", "FACTORY", "OTHERS"];

async function getSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new Error("Unauthorized");
  return session;
}

function branchFilter(role: Role, userBranchId: string | null, filterBranchId?: string) {
  if (role === "SUPERVISOR") return filterBranchId ? { branchId: filterBranchId } : {};
  return { branchId: userBranchId! };
}

export async function getCustomers(filterBranchId?: string) {
  const session = await getSession();
  const { role, branchId } = session.user;
  return prisma.customer.findMany({
    where: branchFilter(role, branchId, filterBranchId),
    include: {
      branch: { select: { id: true, name: true } },
      jobCategory: { select: { id: true, name: true, price: true } },
      addresses: { select: { id: true, address: true, lat: true, lng: true }, orderBy: { createdAt: "asc" } },
      appointments: {
        orderBy: { date: "desc" },
        select: {
          id: true,
          jobNo: true,
          jobTitle: true,
          date: true,
          time: true,
          timeFinish: true,
          status: true,
          totalPrice: true,
          billingType: true,
          warrantyNote: true,
          approvedAt: true,
          clockOutAt: true,
          jobCategory: { select: { name: true } },
          teams: { select: { name: true } },
          assets: {
            select: {
              acType: true,
              remarks: true,
              technicianRemark: true,
              jobCategory: { select: { name: true } },
            },
          },
        },
      },
      _count: { select: { appointments: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

type AddressInput = { address: string; lat: number | null; lng: number | null };
type CustomerInput = {
  name: string; custType: string; phone: string; phone2?: string; email?: string;
  area: string; propertyType: string; addresses?: AddressInput[];
};
type DuplicatePhoneCustomer = {
  id: string;
  custNo: number;
  name: string;
  phone: string;
  branchId: string;
};

function normalizePhoneForMatch(phone: string) {
  return phone.replace(/\D/g, "");
}

function validateCustomerInput(data: CustomerInput) {
  const addresses = data.addresses
    ?.map((a) => ({ address: a.address.trim(), lat: a.lat, lng: a.lng }))
    .filter((a) => a.address.length > 0) ?? [];

  if (!data.phone.trim()) throw new Error("Phone Number 1 is required.");

  const custType = CUST_TYPES.includes(data.custType as CustomerType)
    ? (data.custType as CustomerType)
    : "END_USER";
  const propertyType = PROPERTY_TYPES.includes(data.propertyType as PropertyType)
    ? (data.propertyType as PropertyType)
    : "OTHERS";

  return {
    name: data.name.trim(),
    custType,
    phone: data.phone.trim(),
    phone2: data.phone2?.trim() || null,
    email: data.email?.trim() || null,
    area: data.area.trim(),
    propertyType,
    addresses,
  };
}

async function findDuplicateCustomerByPhone(
  phone: string,
  targetBranchId?: string,
  excludeCustomerId?: string
): Promise<DuplicatePhoneCustomer | null> {
  const normalizedPhone = normalizePhoneForMatch(phone);
  if (!normalizedPhone) return null;

  const session = await getSession();
  const { role, branchId } = session.user;
  const scopedBranchId = role === "SUPERVISOR" ? targetBranchId : branchId!;
  const candidates = await prisma.customer.findMany({
    where: {
      ...(scopedBranchId ? { branchId: scopedBranchId } : {}),
      ...(excludeCustomerId ? { id: { not: excludeCustomerId } } : {}),
    },
    select: { id: true, custNo: true, name: true, phone: true, branchId: true },
  });

  return candidates.find((customer) => normalizePhoneForMatch(customer.phone) === normalizedPhone) ?? null;
}

export async function findCustomerByPhone(
  phone: string,
  targetBranchId?: string,
  excludeCustomerId?: string
) {
  const session = await getSession();
  if (session.user.role === "TECHNICIAN") throw new Error("Unauthorized");
  return findDuplicateCustomerByPhone(phone, targetBranchId, excludeCustomerId);
}

/** A deal can only be closed once every customer detail is filled in. */
function assertCompleteForClose(data: CustomerInput) {
  const addresses = data.addresses?.filter((a) => a.address.trim().length > 0) ?? [];
  const missing: string[] = [];
  if (!data.name.trim()) missing.push("Full Name");
  if (!CUST_TYPES.includes(data.custType as CustomerType)) missing.push("Customer Type");
  if (!data.phone.trim()) missing.push("Phone Number 1");
  if (!data.area.trim()) missing.push("District");
  if (!PROPERTY_TYPES.includes(data.propertyType as PropertyType)) missing.push("Property Type");
  if (addresses.length === 0) missing.push("Address");
  if (missing.length > 0) throw new Error(`Please complete these fields before closing the deal: ${missing.join(", ")}.`);
}

export async function createCustomer(data: {
  name: string; custType: string; phone: string; phone2?: string; email?: string;
  area: string; propertyType: string; branchId?: string; addresses?: AddressInput[];
}) {
  const session = await getSession();
  const { role, branchId } = session.user;
  if (role === "TECHNICIAN") throw new Error("Unauthorized");

  const targetBranch = role === "SUPERVISOR" ? data.branchId! : branchId!;
  if (!targetBranch) throw new Error("Branch is required.");
  const validated = validateCustomerInput(data);
  const duplicate = await findDuplicateCustomerByPhone(validated.phone, targetBranch);
  if (duplicate) throw new Error(`Phone number already exists for customer CU-${String(duplicate.custNo).padStart(4, "0")}.`);
  const custNo = await nextCustomerNo();

  const customer = await prisma.customer.create({
    data: {
      custNo,
      // Quick-add: an unnamed customer defaults to "Lead" and can be renamed later.
      name: validated.name || "Lead",
      custType: validated.custType,
      phone: validated.phone,
      phone2: validated.phone2,
      email: validated.email,
      area: validated.area,
      propertyType: validated.propertyType,
      branchId: targetBranch,
      status: "PENDING",
      addresses: { create: validated.addresses },
    },
  });
  revalidatePath("/customers");
  return { id: customer.id };
}

export async function updateCustomer(
  id: string,
  data: { name: string; custType: string; phone: string; phone2?: string; email?: string; area: string; propertyType: string; addresses?: AddressInput[]; closeDeal?: boolean }
) {
  const session = await getSession();
  const { role, branchId } = session.user;
  if (role === "TECHNICIAN") throw new Error("Unauthorized");

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw new Error("Customer not found.");
  if (role !== "SUPERVISOR" && customer.branchId !== branchId) throw new Error("Unauthorized");
  const validated = validateCustomerInput(data);
  if (data.closeDeal) assertCompleteForClose(data);
  const duplicate = await findDuplicateCustomerByPhone(validated.phone, customer.branchId, id);
  if (duplicate) throw new Error(`Phone number already exists for customer CU-${String(duplicate.custNo).padStart(4, "0")}.`);

  await prisma.customerAddress.deleteMany({ where: { customerId: id } });
  await prisma.customer.update({
    where: { id },
    data: {
      name: validated.name,
      custType: validated.custType,
      phone: validated.phone,
      phone2: validated.phone2,
      email: validated.email,
      area: validated.area,
      propertyType: validated.propertyType,
      ...(data.closeDeal ? { status: "CLOSED" as const } : {}),
      addresses: { create: validated.addresses },
    },
  });
  revalidatePath("/customers");
}

export async function deleteCustomer(id: string) {
  const session = await getSession();
  const { role, branchId } = session.user;
  if (role === "TECHNICIAN") throw new Error("Unauthorized");

  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw new Error("Customer not found.");
  if (role !== "SUPERVISOR" && customer.branchId !== branchId) throw new Error("Unauthorized");

  const apptCount = await prisma.appointment.count({ where: { customerId: id } });
  if (apptCount > 0)
    throw new Error(`This customer has ${apptCount} appointment(s) and cannot be deleted.`);

  await prisma.customer.delete({ where: { id } });
  revalidatePath("/customers");
}
