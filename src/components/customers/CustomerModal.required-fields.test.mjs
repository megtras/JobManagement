import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const modalSource = readFileSync(new URL("./CustomerModal.tsx", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("./CustomersClient.tsx", import.meta.url), "utf8");
const workLocationSource = readFileSync(new URL("../../lib/customer-work-locations.ts", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../../lib/actions/customers.ts", import.meta.url), "utf8");
const apptActionSource = readFileSync(new URL("../../lib/actions/appointments.ts", import.meta.url), "utf8");

test("phone number 1 is the only required field; everything else is optional on add", () => {
  assert.match(modalSource, />Phone Number 1</);
  assert.match(modalSource, /Phone Number 2/);
  assert.doesNotMatch(modalSource, /Second Phone Number/);
  assert.match(modalSource, /Phone Number 2 <span className="text-gray-400 font-normal">\(optional\)<\/span>/);
  assert.match(modalSource, /Full Name <span className="text-gray-400 font-normal">\(optional\)<\/span>/);
  assert.match(modalSource, /Customer Type <span className="text-gray-400 font-normal">\(optional\)<\/span>/);
  assert.match(modalSource, /District <span className="text-gray-400 font-normal">\(optional\)<\/span>/);
  assert.match(modalSource, /Property Type <span className="text-gray-400 font-normal">\(optional\)<\/span>/);
  assert.match(modalSource, /value=\{phone2\} onChange=\{e => setPhone2\(e\.target\.value\)\}/);
  assert.doesNotMatch(modalSource, /value=\{phone2\} onChange=\{e => setPhone2\(e\.target\.value\)\} required/);
});

test("normal submit only blocks on an empty phone number 1", () => {
  assert.match(modalSource, /if \(!phone\.trim\(\)\) \{\s*setShowPhoneError\(true\)/);
  assert.match(modalSource, /<form[\s\S]*noValidate/);
  assert.match(modalSource, /const \[showPhoneError, setShowPhoneError\] = useState\(false\)/);
  assert.match(modalSource, /showPhoneError && !phone\.trim\(\)/);
  assert.match(modalSource, /disabled=\{pending\}/);
  assert.doesNotMatch(modalSource, /disabled=\{pending \|\| !canSubmit\}/);
});

test("a customer is created as PENDING; the close-deal form gating is removed", () => {
  // creation always lands as PENDING
  assert.match(actionSource, /status: "PENDING"/);
  // the deal now closes when an appointment is set, not via the customer form
  assert.doesNotMatch(modalSource, />Close Deal</);
  assert.doesNotMatch(modalSource, /handleCloseDeal/);
  assert.doesNotMatch(modalSource, /showCloseErrors/);
  assert.doesNotMatch(modalSource, /const isComplete/);
  assert.doesNotMatch(modalSource, /closeDeal: true/);
});

test("server keeps the close-deal completeness helper available as a fallback", () => {
  assert.match(actionSource, /validateCustomerInput\(data\)/);
  assert.match(actionSource, /Phone Number 1 is required\./);
  assert.match(actionSource, /phone2: data\.phone2\?\.trim\(\) \|\| null/);
  // save path no longer rejects missing optional fields
  assert.doesNotMatch(actionSource, /Full Name is required\./);
  assert.doesNotMatch(actionSource, /Customer Type is required\./);
  assert.doesNotMatch(actionSource, /District is required\./);
  assert.doesNotMatch(actionSource, /Property Type is required\./);
  // close path enforces completeness and flips status to CLOSED
  assert.match(actionSource, /assertCompleteForClose\(data\)/);
  assert.match(actionSource, /Please complete these fields before closing the deal/);
  assert.match(actionSource, /data\.closeDeal \? \{ status: "CLOSED" as const \}/);
});

test("setting an appointment for a pending customer closes the deal", () => {
  // no CLOSED-customer gate anymore â€” any customer can receive an appointment
  assert.doesNotMatch(apptActionSource, /not yet a closed deal/);
  // creating an appointment flips a pending customer to CLOSED in the same transaction
  assert.match(apptActionSource, /if \(customer\.status !== "CLOSED"\)/);
  assert.match(apptActionSource, /data: \{ status: "CLOSED" \}/);
});

test("customer list lets every customer set an appointment", () => {
  // every row gets an Add Appointment action; the Close Deal button is gone
  assert.match(clientSource, /openAddAppt\(c\)/);
  assert.match(clientSource, /closes deal/);
  assert.doesNotMatch(clientSource, /title="Close Deal"/);
  assert.doesNotMatch(clientSource, /CheckCircle2/);
});

test("adding a customer with an existing phone offers appointment creation instead of duplicating", () => {
  assert.match(actionSource, /function normalizePhoneForMatch\(phone: string\)/);
  assert.match(actionSource, /export async function findCustomerByPhone/);
  assert.match(actionSource, /findDuplicateCustomerByPhone\(validated\.phone, targetBranch\)/);
  assert.match(actionSource, /Phone number already exists for customer CU-/);

  assert.match(modalSource, /findCustomerByPhone\(phone, branchId\)/);
  assert.match(modalSource, /const \[duplicateCustomer, setDuplicateCustomer\] = useState<DuplicateCustomer \| null>\(null\)/);
  assert.match(modalSource, />Phone number already exists</);
  assert.match(modalSource, /Add Appointment/);
  assert.match(modalSource, /onDuplicateAppointment\?\.\(duplicateCustomer\.id\)/);
  assert.match(clientSource, /onDuplicateAppointment=\{\(customerId\) => \{/);
  assert.match(clientSource, /setApptCustomerId\(customerId\)/);
  assert.match(clientSource, /setApptModal\(true\)/);
});

test("customer list supports searching by customer name and phone numbers", () => {
  assert.match(clientSource, /const \[search, setSearch\] = useState\(""\)/);
  assert.match(clientSource, /const normalizedSearch = search\.trim\(\)\.toLowerCase\(\)/);
  assert.match(clientSource, /c\.name\.toLowerCase\(\)\.includes\(normalizedSearch\)/);
  assert.match(clientSource, /c\.phone\.toLowerCase\(\)\.includes\(normalizedSearch\)/);
  assert.match(clientSource, /c\.phone2\?\.toLowerCase\(\)\.includes\(normalizedSearch\) \?\? false/);
  assert.match(clientSource, /placeholder="Search customer name or phone"/);
});

test("customer search sits below the summary boxes above the table", () => {
  assert.match(clientSource, /grid-cols-1 md:grid-cols-4[\s\S]*<StatBox label="Closed Deals"[\s\S]*<div className="mt-\[30px\] mb-4 flex justify-end">[\s\S]*placeholder="Search customer name or phone"[\s\S]*<ResponsiveListShell>/);
  assert.match(clientSource, /w-full sm:w-\[420px\] lg:w-\[520px\]/);
});

test("customer summary boxes replace deal tabs and filter the table", () => {
  assert.match(clientSource, /function StatBox\(\{ label, value, icon: Icon, color, active = false, onClick \}/);
  assert.match(clientSource, /<StatBox label="Total Customers"[\s\S]*active=\{statusFilter === "ALL" && !serviceDueOnly\}[\s\S]*onClick=\{\(\) => \{ setStatusFilter\("ALL"\); setServiceDueOnly\(false\); \}\}/);
  assert.match(clientSource, /<StatBox label="Pending Deals"[\s\S]*active=\{statusFilter === "PENDING" && !serviceDueOnly\}[\s\S]*onClick=\{\(\) => \{ setStatusFilter\("PENDING"\); setServiceDueOnly\(false\); \}\}/);
  assert.match(clientSource, /<StatBox label="Closed Deals"[\s\S]*active=\{statusFilter === "CLOSED" && !serviceDueOnly\}[\s\S]*onClick=\{\(\) => \{ setStatusFilter\("CLOSED"\); setServiceDueOnly\(false\); \}\}/);
  assert.match(clientSource, /<StatBox label="Service Due"[\s\S]*active=\{serviceDueOnly\}[\s\S]*onClick=\{\(\) => \{ setStatusFilter\("ALL"\); setServiceDueOnly\(true\); \}\}/);
  assert.doesNotMatch(clientSource, /\(\["ALL", "PENDING", "CLOSED"\] as const\)\.map/);
});

test("customer add button has a wider stable width", () => {
  assert.match(clientSource, /<UserPlus className="w-4 h-4" \/> Add/);
  assert.match(clientSource, /min-w-\[104px\] justify-center/);
});

test("customer search scans all periods while preserving branch and deal filters", () => {
  assert.match(clientSource, /const isSearching = normalizedSearch\.length > 0/);
  assert.match(clientSource, /\.filter\(\(c\) => isSearching \|\| inPeriod\(c\.createdAt, view, cursor\)\)/);
  assert.match(clientSource, /\.filter\(\(c\) => branchFilterId === "ALL" \|\| c\.branchId === branchFilterId\)/);
  assert.match(clientSource, /\.filter\(\(c\) => statusFilter === "ALL" \|\| c\.status === statusFilter\)/);
});

test("appointment modal lists every customer by name or phone", () => {
  const apptModalSource = readFileSync(new URL("../appointments/AppointmentModal.tsx", import.meta.url), "utf8");
  assert.match(apptModalSource, /const selectableCustomers = customers/);
  assert.doesNotMatch(apptModalSource, /customer\.status !== "PENDING"/);
  assert.match(apptModalSource, /customer\.name \? `\$\{customer\.name\} - \$\{customer\.phone\}` : customer\.phone/);
  assert.doesNotMatch(apptModalSource, /Â·/);
});

test("includes Customer Type and Property Type selects in spec order", () => {
  const custType = modalSource.indexOf(">Customer Type ");
  const phone1 = modalSource.indexOf(">Phone Number 1<");
  const district = modalSource.indexOf(">District ");
  const propertyType = modalSource.indexOf(">Property Type ");

  assert(custType > -1, "expected Customer Type field");
  assert(custType < phone1, "expected Customer Type above Phone Number 1");
  assert(propertyType > district, "expected Property Type below District");

  assert.match(modalSource, /CUST_TYPE_OPTIONS/);
  assert.match(modalSource, /Corporate/);
  assert.match(modalSource, /End User/);
  assert.match(modalSource, /PROPERTY_TYPE_OPTIONS/);
  assert.match(modalSource, /Condo[\s\S]*Landed[\s\S]*Office[\s\S]*Factory[\s\S]*Others/);
});

test("edit customer keeps emergency phone and all known work locations without showing branch selector", () => {
  assert.match(modalSource, /setPhone2\(editing\.phone2 \?\? ""\)/);
  assert.match(modalSource, /setAddresses\(editing\.addresses \?\? \[\]\)/);
  assert.match(modalSource, /const branchRequired = false/);
  assert.doesNotMatch(clientSource, /isSupervisor=\{isSupervisor\}/);

  assert.match(workLocationSource, /additionalAddress\?: string \| null/);
  assert.match(workLocationSource, /asset\.workLocationAddress \|\| asset\.additionalAddress/);
});

test("customer modal refreshes server data after save so appointment setup uses the latest customer info", () => {
  assert.match(modalSource, /import \{ useEffect, useState, useTransition \} from "react";/);
  assert.match(modalSource, /import \{ useRouter \} from "next\/navigation";/);
  assert.match(modalSource, /const router = useRouter\(\);/);
  assert.match(modalSource, /await updateCustomer\([\s\S]*?router\.refresh\(\);[\s\S]*?onClose\(\);/);
  assert.match(modalSource, /await createCustomer\([\s\S]*?router\.refresh\(\);[\s\S]*?onClose\(\);/);
});

