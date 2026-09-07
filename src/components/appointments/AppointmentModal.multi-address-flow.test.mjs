import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const modalSource = readFileSync(new URL("./AppointmentModal.tsx", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("./AppointmentsClient.tsx", import.meta.url), "utf8");
const pageSource = readFileSync(new URL("../../app/(application)/(system)/appointments/page.tsx", import.meta.url), "utf8");
const customersPageSource = readFileSync(new URL("../../app/(application)/(system)/customers/page.tsx", import.meta.url), "utf8");
const actionSource = readFileSync(new URL("../../lib/actions/appointments.ts", import.meta.url), "utf8");
const schemaSource = readFileSync(new URL("../../../prisma/schema.prisma", import.meta.url), "utf8");

test("appointment page sends every customer address into the appointment modal", () => {
  assert.match(pageSource, /mergeCustomerWorkLocations/);
  assert.match(pageSource, /rawAppts/);
  assert.match(clientSource, /interface CustomerAddress/);
  assert.match(clientSource, /addresses: CustomerAddress\[\]/);
});

test("customers page also falls back to appointment locations for appointment modal", () => {
  assert.match(customersPageSource, /getAppointments\(\)/);
  assert.match(customersPageSource, /mergeCustomerWorkLocations/);
  assert.match(customersPageSource, /rawAppts/);
});

test("appointment modal orders fields per spec: customer, job title, teams, date, time, then work locations", () => {
  const labels = [
    ">Customer<",
    ">Job Title<",
    ">Teams ",
    ">Date<",
    ">Time Start<",
    ">Time Finish ",
    ">Work Location<",
    ">Property Type<",
    ">Assets / Units<",
  ];

  let cursor = -1;
  for (const label of labels) {
    const next = modalSource.indexOf(label, cursor + 1);
    assert(next > cursor, `expected ${label} after previous field`);
    cursor = next;
  }

  // top-level job category is removed; it now lives per asset
  assert.doesNotMatch(modalSource, />Job Category<\/label>/);
});

test("appointment modal prefills work locations from the selected customer's saved addresses", () => {
  assert.match(modalSource, /interface LocationInput/);
  assert.match(modalSource, /interface PropertyGroupInput/);
  assert.match(modalSource, /const selectedCustomer = customers\.find/);
  assert.match(modalSource, /function toLocationInput\(address: CustomerAddress, propertyType = ""\): LocationInput/);
  assert.match(modalSource, /selectedCustomer\?\.addresses\.map\(\(address\) => toLocationInput\(address, selectedCustomer\.propertyType\)\)/);
  assert.match(modalSource, /setLocations\(customerAddresses\)/);
  assert.match(modalSource, /locations\.map\(\(location, locationIndex\)/);
  assert.match(modalSource, /location\.propertyGroups\.map\(\(propertyGroup, propertyIndex\)/);
  assert.match(modalSource, /No saved locations\. Click \\"Add Location\\" to add one\./);
  assert.match(modalSource, /addPropertyGroup/);
  assert.match(modalSource, /<Plus className="w-3\.5 h-3\.5" \/> Add Property/);
  assert.match(modalSource, /propertyGroup\.propertyType &&/);
  assert.doesNotMatch(modalSource, /newPropertyType/);
});

test("appointment modal carries the customer's saved property type into prefilled work locations", () => {
  assert.match(modalSource, /interface CustomerOpt \{ id: string; name: string; phone: string; branchId: string; propertyType: string; status\?: string; addresses: CustomerAddress\[\] \}/);
  assert.match(pageSource, /propertyType: c\.propertyType/);
  assert.match(customersPageSource, /propertyType: customer\.propertyType/);
  assert.match(clientSource, /propertyType: string;/);
  assert.match(modalSource, /function buildEditingLocations\(editing: AppointmentRow, customerPropertyType\?: string \| null\): LocationInput\[]/);
  assert.match(modalSource, /propertyGroups: \[emptyPropertyGroup\(normalizePropertyType\(customerPropertyType\)\)\]/);
  assert.match(modalSource, /const customerPropertyType = customers\.find\(\(customer\) => customer\.id === appointment\.customerId\)\?\.propertyType;/);
  assert.match(modalSource, /setLocations\(buildEditingLocations\(appointment, customerPropertyType\)\)/);
  assert.match(modalSource, /const propertyType = normalizePropertyType\(asset\.propertyType \?\? customerPropertyType\)/);
});

test("appointment property type options match the customer property list and normalize legacy values", () => {
  assert.match(modalSource, /const PROPERTY_TYPE_OPTIONS = \[/);
  assert.match(modalSource, /CONDO[\s\S]*Landed/);
  assert.match(modalSource, /OFFICE[\s\S]*Office/);
  assert.match(modalSource, /FACTORY[\s\S]*Factory/);
  assert.match(modalSource, /OTHERS[\s\S]*Others/);
  assert.match(modalSource, /function normalizePropertyType\(propertyType\?: string \| null\)/);
  assert.match(modalSource, /case "HOUSE":[\s\S]*return "Landed"/);
  assert.match(modalSource, /case "APARTMENT":[\s\S]*return "Condo"/);
  assert.match(modalSource, /case "SHOPLOT":[\s\S]*return "Office"/);
  assert.match(modalSource, /case "GENERAL":[\s\S]*return "Others"/);
  assert.doesNotMatch(modalSource, /const DEFAULT_PROPERTY_TYPES = \["House", "Condo", "Apartment", "Office", "Shoplot", "General"\]/);
});

test("appointment modal preserves add-appointment draft when reopening the same customer", () => {
  assert.match(modalSource, /function addDraftStorageKey\(draftKey: string\)/);
  assert.match(modalSource, /function buildDraftKey\(customerKey: string \| undefined, parentId\?: string\)/);
  assert.match(modalSource, /function uniqueDraftKeys\(keys: string\[\]\)/);
  assert.match(modalSource, /const draftCustomerKey = customerId \|\| preselectedCustomerId \|\| ""/);
  assert.match(modalSource, /const draftKey = buildDraftKey\(draftCustomerKey, parentId\)/);
  assert.match(modalSource, /const restoreDraftKeys = uniqueDraftKeys\(\s*preselectedCustomerId\s*\?\s*\[buildDraftKey\(preselectedCustomerId, parentId\)\]\s*:\s*\[buildDraftKey\("", parentId\)\]\s*\)/);
  assert.match(modalSource, /function findSavedDraft\(\): AddDraftSnapshot \| null/);
  assert.match(modalSource, /const savedDraftRaw = sessionStorage\.getItem\(addDraftStorageKey\(candidateKey\)\)/);
  assert.match(modalSource, /return JSON\.parse\(savedDraftRaw\) as AddDraftSnapshot/);
  assert.match(modalSource, /sessionStorage\.removeItem\(addDraftStorageKey\(candidateKey\)\)/);
  assert.match(modalSource, /function clearDrafts\(\)/);
  assert.match(modalSource, /for \(const candidateKey of uniqueDraftKeys\(\[draftKey, buildDraftKey\(preselectedCustomerId, parentId\)\]\)\) \{/);
  assert.match(modalSource, /sessionStorage\.setItem\(addDraftStorageKey\(candidateKey\), snapshot\)/);
  assert.match(modalSource, /const restoredAddDraftRef = useRef\(false\)/);
  assert.match(modalSource, /const savedDraft = findSavedDraft\(\)/);
  assert.match(modalSource, /restoredAddDraftRef\.current = true/);
  assert.match(modalSource, /clearDrafts\(\);/);
  assert.match(modalSource, /const handleModalClose = \(\) =>/);
  assert.match(modalSource, /persistAddDraft\(\);/);
  assert.match(modalSource, /onClick=\{handleModalClose\}/);
  assert.match(modalSource, /onClose=\{\(\) => setLocationPicker\(null\)\}/);
  assert.match(modalSource, /\}, \[customers, editing, open, parentId, preselectedCustomerId\]\);/);
  assert.doesNotMatch(modalSource, /\}, \[draftKey, editing, open, preselectedCustomerId\]\);/);
});

test("appointment modal keeps job title input controlled for legacy appointments", () => {
  assert.match(modalSource, /const \[jobTitle, setJobTitle\] = useState\(""\)/);
  assert.match(modalSource, /setJobTitle\(appointment\.jobTitle \?\? ""\)/);
  assert.match(modalSource, /<input value=\{jobTitle\}/);
  assert.doesNotMatch(modalSource, /setJobTitle\(editing\.jobTitle\);/);
});

test("editing appointment reloads fresh detail data before rebuilding property groups", () => {
  assert.match(modalSource, /function applyEditingDraft\(appointment: AppointmentRow\)/);
  assert.match(modalSource, /applyEditingDraft\(editing\)/);
  assert.match(modalSource, /fetch\(`\/api\/appointments\/\$\{editing\.id\}`, \{ cache: "no-store" \}\)/);
  assert.match(modalSource, /const freshAppointment = await res\.json\(\) as AppointmentRow/);
  assert.match(modalSource, /applyEditingDraft\(freshAppointment\)/);
  assert.match(modalSource, /setLocations\(buildEditingLocations\(appointment, customerPropertyType\)\)/);
});

test("appointment modal assigns optional multiple teams through a compact dropdown", () => {
  assert.match(modalSource, /interface TeamOpt \{ id: string; name: string; branchId: string; members: TeamMember\[\] \}/);
  assert.match(modalSource, /const availableTeams = useMemo/);
  assert.match(modalSource, /teams\.filter\(\(team\) => team\.branchId === selectedCustomer\.branchId\)/);
  // Team is optional now — submit no longer blocks when none is assigned.
  assert.doesNotMatch(modalSource, /Please assign at least one team/);
  assert.match(modalSource, /Teams <span className="text-gray-400 font-normal">\(optional\)<\/span>/);
  assert.match(modalSource, /function toggleTeam\(teamId: string\)/);
  assert.match(modalSource, /const \[teamMenuOpen, setTeamMenuOpen\] = useState\(false\)/);
  assert.match(modalSource, /const selectedTeamSummary = useMemo/);
  assert.match(modalSource, /Select teams/);
  assert.match(modalSource, /teamIds\.length <= 2/);
  assert.match(modalSource, /checked=\{teamIds\.includes\(team\.id\)\}/);
  assert.match(modalSource, /onChange=\{\(\) => toggleTeam\(team\.id\)\}/);
  assert.match(modalSource, /onClick=\{\(\) => setTeamMenuOpen\(\(open\) => !open\)\}/);
  assert.match(modalSource, /teamMenuOpen && \(/);
  assert.match(modalSource, /availableTeams\.map\(\(team\) => \(/);
  assert.match(modalSource, /No team registered under this branch yet\./);
  assert.doesNotMatch(modalSource, /technicianId/);
});

test("appointment requires only customer, job title, date and time to set", () => {
  assert.match(modalSource, /if \(!customerId\) \{ setError\("Please select a customer\."\); return; \}/);
  assert.match(modalSource, /if \(!jobTitle\.trim\(\)\) \{ setError\("Please enter a job title\."\); return; \}/);
  assert.match(modalSource, /if \(!date\) \{ setError\("Please select a date\."\); return; \}/);
  assert.match(modalSource, /if \(!time\) \{ setError\("Please select a start time\."\); return; \}/);
  // work location, assets and finish time are no longer required to save
  assert.doesNotMatch(modalSource, /Each asset needs an AC type/);
  assert.doesNotMatch(modalSource, /needs map coordinates/);
  assert.doesNotMatch(modalSource, /Please select a finish time/);
});

test("appointment save keeps the selected work location even before any assets are added", () => {
  assert.match(modalSource, /const primaryAssetLocation = validAssets\.find\(\(asset\) => asset\.workLocationLat !== null && asset\.workLocationLng !== null\)/);
  assert.match(modalSource, /const primarySavedLocation = locations\.find\(\(location\) => location\.address\.trim\(\)\)/);
  assert.match(modalSource, /const primaryAddress = primaryAssetLocation\?\.workLocationAddress \?\? primarySavedLocation\?\.address \?\? ""/);
  assert.match(modalSource, /const primaryLat = primaryAssetLocation\?\.workLocationLat \?\? primarySavedLocation\?\.lat \?\? null/);
  assert.match(modalSource, /const primaryLng = primaryAssetLocation\?\.workLocationLng \?\? primarySavedLocation\?\.lng \?\? null/);
});

test("appointment modal allows managers and supervisors to key in past schedule values when needed", () => {
  assert.match(modalSource, /allowPastSchedule\?: boolean/);
  assert.match(modalSource, /if \(!allowPastSchedule && timeFinish && timeFinish < time\)/);
  assert.doesNotMatch(modalSource, /<input type="date"[\s\S]*min=\{todayISO\}/);
  assert.doesNotMatch(modalSource, /<input type="time"[\s\S]*min=\{startMin\}/);
  assert.doesNotMatch(modalSource, /<input type="time"[\s\S]*min=\{finishMin\}/);
  assert.doesNotMatch(modalSource, /The start time has already passed/);
});

test("appointment modal time fields are dropdowns of 15-minute slots", () => {
  assert.match(modalSource, /function TimeSelect\(\{ value, onChange, ariaLabel, placeholder \}/);
  // 24 hours x 4 slots per hour, labelled in 12-hour form.
  assert.match(modalSource, /const TIME_OPTIONS = Array\.from\(\{ length: 24 \* 4 \}/);
  assert.match(modalSource, /const totalMinutes = index \* 15;/);
  assert.match(modalSource, /return \{ value, label: formatTimeDisplay\(value\) \};/);
  assert.match(modalSource, /<TimeSelect\s*value=\{time\}[\s\S]*ariaLabel="Time Start"/);
  assert.match(modalSource, /<TimeSelect\s*value=\{timeFinish\}[\s\S]*ariaLabel="Time Finish"/);
  // Picking a start time still pushes the finish an hour later.
  assert.match(modalSource, /if \(start\) setTimeFinish\(addOneHour\(start\)\);/);
  assert.doesNotMatch(modalSource, /<input type="time"/);
});

test("appointment modal only exposes manual status completion controls to managers and supervisors", () => {
  assert.match(modalSource, /canManageCompletion\?: boolean/);
  assert.match(modalSource, /\{isEdit && canManageCompletion && \(/);
});

test("appointment modal refreshes server data after save so edited property groups reload", () => {
  assert.match(modalSource, /import \{ useRouter \} from "next\/navigation"/);
  assert.match(modalSource, /const router = useRouter\(\)/);
  assert.match(modalSource, /router\.refresh\(\)/);
});

test("appointment modal notifies the parent after a successful save", () => {
  assert.match(modalSource, /onSaved\?: \(saved\?: \{ date\?: string; appointmentId\?: string \}\) => void/);
  assert.match(modalSource, /onSaved,/);
  assert.match(modalSource, /onSaved\?\.\(\{ date, appointmentId: created\.id \}\)/);
  assert.match(modalSource, /clearDrafts\(\);\s*if \(isEdit\) onSaved\?\.\(\{ date \}\);\s*router\.refresh\(\);\s*onClose\(\);/);
});

test("editing appointment preserves existing asset ids so photos and technician remarks remain attached", () => {
  assert.match(modalSource, /interface AssetInput \{\s*id\?: string;/);
  assert.match(modalSource, /interface AppointmentAssetRow \{\s*id\?: string;/);
  assert.match(modalSource, /id: asset\.id,/);
  assert.match(actionSource, /id\?: string;/);
  assert.match(actionSource, /id: typeof a\.id === "string" && a\.id \? a\.id : undefined/);
  assert.match(actionSource, /const existingAssets = await prisma\.appointmentAsset\.findMany/);
  assert.match(actionSource, /_count: \{ select: \{ servicePhotos: true \} \}/);
  assert.match(actionSource, /function assetSignature\(asset:/);
  assert.match(actionSource, /const hasAssetEvidence = \(asset:/);
  assert.match(actionSource, /const sameSignatureProtected = findUnretainedExistingAsset\(asset, true\)/);
  assert.match(actionSource, /sameSignatureProtected\?\.id\s*\?\?/);
  assert.match(actionSource, /sameSignatureExisting\?\.id/);
  assert.match(actionSource, /await prisma\.appointmentAsset\.update/);
  assert.match(actionSource, /retainedAssetIds\.add\(targetAssetId\)/);
  assert.match(actionSource, /asset\._count\.servicePhotos === 0 && !asset\.technicianRemark/);
  assert.doesNotMatch(actionSource, /appointmentAsset\.deleteMany\(\{ where: \{ appointmentId: id \} \}\)/);
});

test("server action persists job title, teams, time finish, and per-asset category + price", () => {
  assert.match(schemaSource, /jobTitle\s+String/);
  assert.match(schemaSource, /propertyType\s+String/);
  assert.match(schemaSource, /workLocationAddress\s+String/);
  assert.match(schemaSource, /workLocationLat\s+Float\?/);
  assert.match(schemaSource, /workLocationLng\s+Float\?/);
  assert.match(schemaSource, /acType\s+String/);
  assert.match(schemaSource, /unitPrice\s+Decimal/);
  assert.match(schemaSource, /timeFinish\s+String/);
  assert.match(schemaSource, /model Team \{/);

  assert.match(actionSource, /jobTitle: string/);
  assert.match(actionSource, /workLocationAddress: string/);
  assert.match(actionSource, /propertyType: string/);
  assert.match(actionSource, /calculateChargeableAssetTotal\(assets\)/);
  assert.match(actionSource, /createAppointmentAsset/);
  assert.match(actionSource, /jobTitle: validated\.jobTitle/);
  assert.match(actionSource, /acType: asset\.acType/);
  assert.match(actionSource, /unitPrice: asset\.unitPrice/);
  assert.match(actionSource, /jobCategory: \{ connect: \{ id: asset\.jobCategoryId \} \}/);
  assert.match(actionSource, /propertyType: asset\.propertyType/);
  assert.match(actionSource, /workLocationAddress: asset\.workLocationAddress/);
  assert.match(actionSource, /appointment: \{ connect: \{ id: appointmentId \} \}/);
  assert.match(actionSource, /teams: \{ connect: validated\.teamIds/);
  assert.match(actionSource, /teams: \{ set: validated\.teamIds/);
  assert.match(actionSource, /timeFinish/);
  assert.match(actionSource, /revalidatePath\(`\/appointments\/\$\{id\}`\)/);
  assert.doesNotMatch(actionSource, /technician: \{ connect: \{ id: data\.technicianId \} \}/);
  assert.doesNotMatch(actionSource, /if \(!data\.technicianId\) throw/);
  assert.doesNotMatch(actionSource, /appointmentAsset\.createMany/);
});
