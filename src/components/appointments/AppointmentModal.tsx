"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { FormEvent, KeyboardEvent, MouseEvent, WheelEvent } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, Plus, Trash2, Navigation, MapPin, Pencil, ChevronDown, Clock } from "lucide-react";
import { createAppointment } from "@/lib/actions/appointments";
import { AddressPickerModal } from "@/components/customers/AddressPickerModal";

interface Category { id: string; name: string; price: number }
interface CustomerAddress { id?: string; address: string; lat: number | null; lng: number | null }
interface CustomerOpt { id: string; name: string; phone: string; branchId: string; propertyType: string; status?: string; addresses: CustomerAddress[] }
interface TeamMember { id: string; name: string }
interface TeamOpt { id: string; name: string; branchId: string; members: TeamMember[] }

interface AssetInput {
  id?: string;
  _key: string;
  label: string;
  acType: string;
  jobCategoryId: string;
  unitPrice: string;
  billingType?: "CHARGEABLE" | "WARRANTY" | null;
  remarks: string;
}
interface PropertyGroupInput {
  _key: string;
  propertyType: string;
  assets: AssetInput[];
}
interface LocationInput {
  _key: string;
  address: string;
  lat: number | null;
  lng: number | null;
  propertyGroups: PropertyGroupInput[];
}

interface AppointmentAssetRow {
  id?: string;
  label: string;
  acType?: string | null;
  jobCategoryId?: string | null;
  unitPrice?: number | string | null;
  billingType?: "CHARGEABLE" | "WARRANTY" | null;
  remarks?: string | null;
  additionalAddress: string | null;
  propertyType?: string | null;
  workLocationAddress?: string | null;
  workLocationLat?: number | null;
  workLocationLng?: number | null;
}

interface AppointmentRow {
  id: string; customerId: string; jobTitle: string;
  date: string; time: string; timeFinish?: string | null;
  locationAddress: string;
  locationLat: number | null; locationLng: number | null;
  teams?: { id: string }[];
  status: "COMING_SOON" | "IN_PROGRESS" | "DONE";
  billingType?: "CHARGEABLE" | "WARRANTY";
  warrantyNote?: string | null;
  assets: AppointmentAssetRow[];
}

interface Props {
  open: boolean; onClose: () => void;
  onSaved?: (saved?: { date?: string; appointmentId?: string }) => void;
  categories: Category[]; customers: CustomerOpt[]; teams: TeamOpt[];
  editing?: AppointmentRow | null;
  preselectedCustomerId?: string;
  parentId?: string;
  allowPastSchedule?: boolean;
  canManageCompletion?: boolean;
}

interface AddDraftSnapshot {
  customerId: string;
  jobTitle: string;
  date: string;
  time: string;
  timeFinish: string;
  teamIds: string[];
  locations: LocationInput[];
  status: "COMING_SOON" | "IN_PROGRESS" | "DONE";
  billingType: "CHARGEABLE" | "WARRANTY";
  warrantyNote: string;
}

function addDraftStorageKey(draftKey: string) {
  return `appointment-modal-draft:${draftKey}`;
}

function buildDraftKey(customerKey: string | undefined, parentId?: string) {
  return `${customerKey ?? ""}:${parentId ?? ""}`;
}

function uniqueDraftKeys(keys: string[]) {
  return Array.from(new Set(keys.filter((key) => key.length > 0)));
}

const STATUS_OPTS = [
  { value: "COMING_SOON", label: "Coming Soon" },
  { value: "IN_PROGRESS", label: "In Progress" },
  { value: "DONE", label: "Done" },
] as const;

const PROPERTY_TYPE_OPTIONS = [
  { value: "Condo", label: "Condo" },
  { value: "Landed", label: "Landed" },
  { value: "Office", label: "Office" },
  { value: "Factory", label: "Factory" },
  { value: "Others", label: "Others" },
] as const;
const AC_TYPES = ["Wall Mounted", "Cassette", "Exposed", "Ducting", "Wiring"];

let _k = 0;
const nk = () => String(++_k);

// Open the browser's native date/time picker when the field itself is clicked,
// not only the small calendar/clock icon.
function openNativePicker(e: MouseEvent<HTMLInputElement>) {
  const el = e.currentTarget as HTMLInputElement & { showPicker?: () => void };
  if (typeof el.showPicker === "function") {
    try { el.showPicker(); } catch { /* picker unsupported or already open */ }
  }
}

function emptyAsset(): AssetInput {
  return { _key: nk(), label: "", acType: AC_TYPES[0], jobCategoryId: "", unitPrice: "", remarks: "" };
}

function pad2(n: number) { return String(n).padStart(2, "0"); }

// Local (not UTC) YYYY-MM-DD for the native date input â€” defaults to today.
function todayDateStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// "HH:MM" one hour later, clamped to 23:00.
function addOneHour(time: string): string {
  if (!time) return time;
  const [h, m] = time.split(":").map(Number);
  return `${pad2(Math.min(h + 1, 23))}:${pad2(m)}`;
}

// Default Time Start: 09:00, unless the date is today and it's already later â€” then
// the next full hour after now (e.g. 1:xx PM â†’ 2:00 PM), so it's never in the past.
function defaultStartForDate(dateStr: string): string {
  if (dateStr !== todayDateStr()) return "09:00";
  const hour = Math.min(new Date().getHours() + 1, 23);
  const candidate = `${pad2(hour)}:00`;
  return candidate > "09:00" ? candidate : "09:00";
}

type TimePart = "hour" | "minute" | "meridiem";
type Meridiem = "AM" | "PM";

function wrapNumber(value: number, min: number, max: number) {
  const size = max - min + 1;
  return ((value - min) % size + size) % size + min;
}

function splitTimeValue(value: string) {
  const [rawHour, rawMinute] = value.split(":").map(Number);
  const hour24 = Number.isFinite(rawHour) ? Math.min(Math.max(rawHour, 0), 23) : 9;
  const minute = Number.isFinite(rawMinute) ? Math.min(Math.max(rawMinute, 0), 59) : 0;
  return {
    hour12: hour24 % 12 || 12,
    minute,
    meridiem: hour24 >= 12 ? "PM" as Meridiem : "AM" as Meridiem,
  };
}

function buildTimeValue(hour12: number, minute: number, meridiem: Meridiem) {
  const hour24 = (hour12 % 12) + (meridiem === "PM" ? 12 : 0);
  return `${pad2(hour24)}:${pad2(minute)}`;
}

function formatMobileTimeDisplay(value: string) {
  const parsed = splitTimeValue(value);
  return `${pad2(parsed.hour12)}:${pad2(parsed.minute)} ${parsed.meridiem}`;
}

function parseMobileTimeInput(rawValue: string) {
  const raw = rawValue.trim().toUpperCase();
  if (!raw) return "";

  const meridiemMatch = raw.match(/\s*(AM?|PM?)$/);
  const meridiem = meridiemMatch
    ? (meridiemMatch[1].startsWith("P") ? "PM" : "AM")
    : "";
  const body = raw
    .replace(/\s*(AM?|PM?)$/, "")
    .replace(/[^\d:]/g, "");

  let hourText = "";
  let minuteText = "";
  if (body.includes(":")) {
    const [hour = "", minute = ""] = body.split(":");
    hourText = hour;
    minuteText = minute || "00";
  } else if (body.length <= 2) {
    hourText = body;
    minuteText = "00";
  } else {
    hourText = body.slice(0, -2);
    minuteText = body.slice(-2);
  }

  if (!hourText) return null;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const hour24 = (hour % 12) + (meridiem === "PM" ? 12 : 0);
    return `${pad2(hour24)}:${pad2(minute)}`;
  }

  if (hour < 0 || hour > 23) return null;
  return `${pad2(hour)}:${pad2(minute)}`;
}

function sanitizeMobileTimeDraft(rawValue: string) {
  const upper = rawValue.toUpperCase();
  const meridiemMatch = upper.match(/\s*(AM?|PM?)$/);
  const meridiem = meridiemMatch ? ` ${meridiemMatch[1].startsWith("P") ? "PM" : "AM"}` : "";
  const body = upper
    .replace(/\s*(AM?|PM?)$/, "")
    .replace(/[^\d:]/g, "");

  if (body.includes(":")) {
    const [hour = "", minute = ""] = body.split(":");
    return `${hour.slice(0, 2)}:${minute.slice(0, 2)}${meridiem}`;
  }

  const digits = body.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 3) return `${digits}${meridiem}`;
  return `${digits.slice(0, 2)}:${digits.slice(2)}${meridiem}`;
}

function shouldCommitMobileTimeDraft(draft: string) {
  const text = draft.trim().toUpperCase();
  const parsed = parseMobileTimeInput(text);
  if (!parsed) return false;

  const body = text.replace(/\s*(AM?|PM?)$/, "");
  const digits = body.replace(/\D/g, "");
  const minuteText = body.includes(":") ? body.split(":")[1] ?? "" : "";
  const hasMeridiem = /\s(AM|PM)$/.test(text);
  return digits.length === 4 || minuteText.length >= 2 || hasMeridiem;
}

const MOBILE_TIME_PICKER_OPTIONS = Array.from({ length: 24 * 4 }, (_, index) => {
  const totalMinutes = index * 15;
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const value = `${pad2(hour)}:${pad2(minute)}`;
  return { value, label: formatMobileTimeDisplay(value) };
});

function MobileTimePickerInput({ value, onChange, ariaLabel }: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(() => value ? formatMobileTimeDisplay(value) : "");
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value ? formatMobileTimeDisplay(value) : "");
  }, [editing, value]);

  function applyValue(nextValue: string) {
    onChange(nextValue);
    setDraft(nextValue ? formatMobileTimeDisplay(nextValue) : "");
  }

  function commitDraft(nextDraft: string) {
    const parsed = parseMobileTimeInput(nextDraft);
    setEditing(false);
    setOpen(false);
    if (parsed !== null) {
      applyValue(parsed);
      return;
    }
    setDraft(value ? formatMobileTimeDisplay(value) : "");
  }

  function handleBlur() {
    window.setTimeout(() => {
      if (wrapperRef.current?.contains(document.activeElement)) return;
      commitDraft(draft);
    }, 0);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <input
        type="text"
        inputMode="text"
        value={draft}
        onChange={(e) => {
          const nextDraft = sanitizeMobileTimeDraft(e.target.value);
          setDraft(nextDraft);
          if (shouldCommitMobileTimeDraft(nextDraft)) {
            const parsed = parseMobileTimeInput(nextDraft);
            if (parsed) onChange(parsed);
          }
        }}
        onFocus={(e) => {
          setEditing(true);
          setOpen(true);
          e.currentTarget.select();
        }}
        onClick={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitDraft(draft);
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(value ? formatMobileTimeDisplay(value) : "");
            setEditing(false);
            setOpen(false);
          }
        }}
        aria-label={ariaLabel}
        placeholder="07:00 PM"
        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && (
        <div className="absolute left-0 right-0 top-full z-[90] mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg">
          {MOBILE_TIME_PICKER_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                applyValue(option.value);
                setEditing(false);
                setOpen(false);
              }}
              className={`block w-full px-3 py-2 text-left tabular-nums ${
                option.value === value ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-blue-50 hover:text-blue-700"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TimeSpinnerInput({ value, onChange, ariaLabel }: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [activePart, setActivePart] = useState<TimePart>("hour");
  const [isScrollLocked, setIsScrollLocked] = useState(false);
  const typedRef = useRef<{ part: TimePart; value: string; at: number }>({ part: "hour", value: "", at: 0 });
  const timeSpinnerRef = useRef<HTMLDivElement>(null);
  const parsed = splitTimeValue(value);

  useEffect(() => {
    if (!isScrollLocked) return;

    const preventPageWheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
    };

    document.addEventListener("wheel", preventPageWheel, { passive: false });
    return () => document.removeEventListener("wheel", preventPageWheel);
  }, [isScrollLocked]);

  function updatePart(part: TimePart, patch: number | Meridiem) {
    if (part === "hour" && typeof patch === "number") {
      onChange(buildTimeValue(wrapNumber(patch, 1, 12), parsed.minute, parsed.meridiem));
    } else if (part === "minute" && typeof patch === "number") {
      onChange(buildTimeValue(parsed.hour12, wrapNumber(patch, 0, 59), parsed.meridiem));
    } else if (part === "meridiem" && typeof patch === "string") {
      onChange(buildTimeValue(parsed.hour12, parsed.minute, patch));
    }
  }

  function adjustPart(part: TimePart, delta: number) {
    if (part === "hour") updatePart(part, parsed.hour12 + delta);
    if (part === "minute") updatePart(part, parsed.minute + delta);
    if (part === "meridiem") updatePart(part, parsed.meridiem === "AM" ? "PM" : "AM");
  }

  function applyTypedDigit(part: TimePart, digit: string) {
    if (part === "meridiem") return;
    const now = Date.now();
    const typed = typedRef.current.part === part && now - typedRef.current.at < 900
      ? `${typedRef.current.value}${digit}`.slice(-2)
      : digit;
    typedRef.current = { part, value: typed, at: now };

    let numeric = Number(typed);
    if (part === "hour" && (numeric < 1 || numeric > 12)) numeric = Number(digit) || 12;
    if (part === "minute" && numeric > 59) numeric = Number(digit);
    updatePart(part, numeric);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowUp" || e.key === "ArrowRight") {
      e.preventDefault();
      adjustPart(activePart, 1);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
      e.preventDefault();
      adjustPart(activePart, -1);
      return;
    }
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      applyTypedDigit(activePart, e.key);
      return;
    }
    if (e.key.toLowerCase() === "a" || e.key.toLowerCase() === "p") {
      e.preventDefault();
      setActivePart("meridiem");
      updatePart("meridiem", e.key.toLowerCase() === "a" ? "AM" : "PM");
      return;
    }
    if (e.key === ":") {
      e.preventDefault();
      setActivePart("minute");
    }
  }

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    adjustPart(activePart, e.deltaY < 0 ? 1 : -1);
  }

  function handleBlur() {
    window.setTimeout(() => {
      if (timeSpinnerRef.current?.contains(document.activeElement)) return;
      setIsScrollLocked(false);
    }, 0);
  }

  const partClass = (part: TimePart) =>
    `rounded-md px-1.5 py-0.5 tabular-nums transition ${activePart === part ? "bg-blue-600 text-white" : "text-gray-800 hover:bg-gray-100"}`;

  return (
    <div
      ref={timeSpinnerRef}
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
      onFocus={() => setIsScrollLocked(true)}
      onMouseDown={() => setIsScrollLocked(true)}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      onWheel={handleWheel}
      className="flex w-full items-center rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm focus-within:ring-2 focus-within:ring-blue-500"
    >
      <button type="button" className={partClass("hour")} onFocus={() => setActivePart("hour")} onClick={() => setActivePart("hour")}>
        {pad2(parsed.hour12)}
      </button>
      <span className="px-0.5 text-gray-400">:</span>
      <button type="button" className={partClass("minute")} onFocus={() => setActivePart("minute")} onClick={() => setActivePart("minute")}>
        {pad2(parsed.minute)}
      </button>
      <button type="button" className={`${partClass("meridiem")} ml-1`} onFocus={() => setActivePart("meridiem")} onClick={() => setActivePart("meridiem")}>
        {parsed.meridiem}
      </button>
      <Clock className="ml-auto h-4 w-4 text-gray-500" />
    </div>
  );
}

function normalizePropertyType(propertyType?: string | null) {
  switch ((propertyType ?? "").trim().toUpperCase()) {
    case "CONDO":
      return "Condo";
    case "LANDED":
    case "HOUSE":
      return "Landed";
    case "APARTMENT":
      return "Condo";
    case "OFFICE":
    case "SHOPLOT":
      return "Office";
    case "FACTORY":
      return "Factory";
    case "OTHERS":
    case "GENERAL":
      return "Others";
    default:
      return propertyType?.trim() || "Others";
  }
}

// Default to the first property type so the Property Type dropdown reflects a real
// selection (not a misleading first-option display) and the Assets / Units section
// shows immediately — matching the Edit Appointment behaviour.
function emptyPropertyGroup(propertyType: string = PROPERTY_TYPE_OPTIONS[0].value): PropertyGroupInput {
  return { _key: nk(), propertyType, assets: [emptyAsset()] };
}

function toLocationInput(address: CustomerAddress, propertyType = ""): LocationInput {
  return {
    _key: address.id ?? nk(),
    address: address.address,
    lat: address.lat,
    lng: address.lng,
    propertyGroups: [emptyPropertyGroup(normalizePropertyType(propertyType))],
  };
}

function assetFromRow(asset: AppointmentAssetRow): AssetInput {
  return {
    id: asset.id,
    _key: nk(),
    label: asset.label,
    acType: asset.acType ?? AC_TYPES[0],
    jobCategoryId: asset.jobCategoryId ?? "",
    unitPrice: asset.unitPrice != null ? String(asset.unitPrice) : "",
    billingType: asset.billingType ?? null,
    remarks: asset.remarks ?? "",
  };
}

function buildEditingLocations(editing: AppointmentRow, customerPropertyType?: string | null): LocationInput[] {
  if (editing.assets.length === 0) {
    return [{
      _key: nk(),
      address: editing.locationAddress,
      lat: editing.locationLat,
      lng: editing.locationLng,
      propertyGroups: [emptyPropertyGroup(normalizePropertyType(customerPropertyType))],
    }];
  }

  const grouped = new Map<string, LocationInput>();

  for (const asset of editing.assets) {
    const address = asset.workLocationAddress || asset.additionalAddress || editing.locationAddress;
    const propertyType = normalizePropertyType(asset.propertyType ?? customerPropertyType);
    const existingLocation = grouped.get(address);

    if (!existingLocation) {
      grouped.set(address, {
        _key: nk(),
        address,
        lat: asset.workLocationLat ?? editing.locationLat,
        lng: asset.workLocationLng ?? editing.locationLng,
        propertyGroups: [{ _key: nk(), propertyType, assets: [assetFromRow(asset)] }],
      });
      continue;
    }

    const existingProperty = existingLocation.propertyGroups.find((group) => group.propertyType === propertyType);
    if (existingProperty) {
      existingProperty.assets.push(assetFromRow(asset));
    } else {
      existingLocation.propertyGroups.push({ _key: nk(), propertyType, assets: [assetFromRow(asset)] });
    }
  }

  return Array.from(grouped.values());
}

export function AppointmentModal({
  open,
  onClose,
  onSaved,
  categories,
  customers,
  teams,
  editing,
  preselectedCustomerId,
  parentId,
  allowPastSchedule = false,
  canManageCompletion = false,
}: Props) {
  const isEdit = !!editing;
  const isSubJob = !!parentId;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [timeFinish, setTimeFinish] = useState("11:00");
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [teamMenuOpen, setTeamMenuOpen] = useState(false);
  const [locations, setLocations] = useState<LocationInput[]>([]);
  const [status, setStatus] = useState<"COMING_SOON" | "IN_PROGRESS" | "DONE">("COMING_SOON");
  const [billingType, setBillingType] = useState<"CHARGEABLE" | "WARRANTY">("CHARGEABLE");
  const [warrantyNote, setWarrantyNote] = useState("");
  const [locationPicker, setLocationPicker] = useState<{ mode: "add" } | { mode: "edit"; key: string } | null>(null);
  const restoredAddDraftRef = useRef(false);

  // Any customer can receive an appointment â€” setting one closes a pending deal.
  const selectableCustomers = customers;
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const availableTeams = useMemo(
    () => selectedCustomer ? teams.filter((team) => team.branchId === selectedCustomer.branchId) : [],
    [teams, selectedCustomer]
  );
  const selectedTeamSummary = useMemo(() => {
    if (teamIds.length === 0) return "Select teams";
    const selectedNames = availableTeams
      .filter((team) => teamIds.includes(team.id))
      .map((team) => team.name);
    if (selectedNames.length === 0) return "Select teams";
    if (teamIds.length <= 2) return selectedNames.join(", ");
    return `${teamIds.length} teams selected`;
  }, [availableTeams, teamIds]);
  const draftCustomerKey = customerId || preselectedCustomerId || "";
  const draftKey = buildDraftKey(draftCustomerKey, parentId);
  const restoreDraftKeys = uniqueDraftKeys(
    preselectedCustomerId
      ? [buildDraftKey(preselectedCustomerId, parentId)]
      : [buildDraftKey("", parentId)]
  );

  function findSavedDraft(): AddDraftSnapshot | null {
    if (typeof window === "undefined") return null;

    for (const candidateKey of restoreDraftKeys) {
      const savedDraftRaw = sessionStorage.getItem(addDraftStorageKey(candidateKey));
      if (!savedDraftRaw) continue;
      try {
        return JSON.parse(savedDraftRaw) as AddDraftSnapshot;
      } catch {
        sessionStorage.removeItem(addDraftStorageKey(candidateKey));
      }
    }

    return null;
  }

  function clearDrafts() {
    if (typeof window === "undefined") return;
    for (const candidateKey of restoreDraftKeys) {
      sessionStorage.removeItem(addDraftStorageKey(candidateKey));
    }
  }

  const persistAddDraft = () => {
    if (typeof window === "undefined" || isEdit) return;
    const snapshot = JSON.stringify({
      customerId,
      jobTitle,
      date,
      time,
      timeFinish,
      teamIds,
      locations,
      status,
      billingType,
      warrantyNote,
    } satisfies AddDraftSnapshot);

    for (const candidateKey of uniqueDraftKeys([draftKey, buildDraftKey(preselectedCustomerId, parentId)])) {
      sessionStorage.setItem(addDraftStorageKey(candidateKey), snapshot);
    }
  };

  const handleModalClose = () => {
    persistAddDraft();
    setTeamMenuOpen(false);
    setLocationPicker(null);
    onClose();
  };

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- reset local draft fields when the modal target changes */
    if (!open) return;
    let cancelled = false;

    function applyEditingDraft(appointment: AppointmentRow) {
      const customerPropertyType = customers.find((customer) => customer.id === appointment.customerId)?.propertyType;
      setCustomerId(appointment.customerId);
      setJobTitle(appointment.jobTitle ?? "");
      setDate(appointment.date.slice(0, 10));
      setTime(appointment.time);
      setTimeFinish(appointment.timeFinish ?? "");
      setTeamIds(appointment.teams?.map((team) => team.id) ?? []);
      setLocations(buildEditingLocations(appointment, customerPropertyType));
      setStatus(appointment.status);
      setBillingType(appointment.billingType ?? "CHARGEABLE");
      setWarrantyNote(appointment.warrantyNote ?? "");
    }

    if (editing) {
      applyEditingDraft(editing);
      void (async () => {
        try {
          const res = await fetch(`/api/appointments/${editing.id}`, { cache: "no-store" });
          if (!res.ok) return;
          const freshAppointment = await res.json() as AppointmentRow;
          if (!cancelled) applyEditingDraft(freshAppointment);
        } catch {
          // Keep the row data if the fresh detail fetch is unavailable.
        }
      })();
    } else {
      const savedDraft = findSavedDraft();
      if (savedDraft) {
        restoredAddDraftRef.current = true;
        setCustomerId(savedDraft.customerId);
        setJobTitle(savedDraft.jobTitle);
        setDate(savedDraft.date);
        setTime(savedDraft.time);
        setTimeFinish(savedDraft.timeFinish);
        setTeamIds(savedDraft.teamIds);
        setTeamMenuOpen(false);
        setLocations(savedDraft.locations);
        setStatus(savedDraft.status);
        setBillingType(savedDraft.billingType ?? "CHARGEABLE");
        setWarrantyNote(savedDraft.warrantyNote ?? "");
      } else {
        setCustomerId(preselectedCustomerId ?? "");
        setJobTitle("");
        const initialDate = todayDateStr();
        const initialStart = defaultStartForDate(initialDate);
        setDate(initialDate);
        setTime(initialStart);
        setTimeFinish(addOneHour(initialStart));
        setTeamIds([]);
        setTeamMenuOpen(false);
        setLocations([]);
        setStatus("COMING_SOON");
        setBillingType("CHARGEABLE");
        setWarrantyNote("");
        clearDrafts();
      }
    }
    setError("");
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => {
      cancelled = true;
    };
  }, [customers, editing, open, parentId, preselectedCustomerId]);

  useEffect(() => {
    if (!open || isEdit || !customerId) return;
    if (restoredAddDraftRef.current) {
      restoredAddDraftRef.current = false;
      return;
    }
    const customerAddresses = selectedCustomer?.addresses.map((address) => toLocationInput(address, selectedCustomer.propertyType)) ?? [];
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- selecting a customer should prefill only that customer's saved addresses */
    setLocations(customerAddresses);
  }, [customerId, isEdit, open, selectedCustomer]);

  useEffect(() => {
    if (!open || isEdit) return;
    persistAddDraft();
  }, [billingType, customerId, date, draftKey, isEdit, jobTitle, locations, open, status, teamIds, time, timeFinish, warrantyNote]);

  useEffect(() => {
    if (!open) return;
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- drop teams that don't belong to the selected customer's branch */
    setTeamIds((prev) => prev.filter((id) => availableTeams.some((team) => team.id === id)));
    setTeamMenuOpen(false);
  }, [availableTeams, open]);

  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);

  const validAssets = useMemo(() => locations.flatMap((location) =>
    location.propertyGroups.flatMap((propertyGroup) => {
      if (!propertyGroup.propertyType.trim()) return [];
      return propertyGroup.assets
        .filter((asset) => asset.acType && asset.jobCategoryId)
        .map((asset) => {
          const rawUnitPrice = asset.unitPrice.trim();
          const categoryPrice = Number(categoryById.get(asset.jobCategoryId)?.price ?? 0);
          const unitPrice = rawUnitPrice === "" ? categoryPrice : Number(rawUnitPrice);
          const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0;
          const assetBillingType = billingType === "WARRANTY" && safeUnitPrice <= 0
            ? "WARRANTY"
            : asset.billingType ?? (billingType === "WARRANTY" ? "WARRANTY" : "CHARGEABLE");

          return {
            id: asset.id,
            label: asset.label.trim(),
            acType: asset.acType,
            jobCategoryId: asset.jobCategoryId,
            unitPrice: safeUnitPrice,
            billingType: assetBillingType,
            remarks: asset.remarks.trim() || undefined,
            propertyType: propertyGroup.propertyType.trim(),
            workLocationAddress: location.address,
            workLocationLat: location.lat,
            workLocationLng: location.lng,
          };
        });
    })
  ), [locations, categoryById, billingType]);
  const totalPrice = validAssets
    .filter((asset) => asset.billingType === "CHARGEABLE")
    .reduce((sum, asset) => sum + asset.unitPrice, 0);


  function commitLocation(address: string, lat: number | null, lng: number | null) {
    if (!address.trim()) return;
    if (locationPicker?.mode === "edit") {
      const key = locationPicker.key;
      setLocations((prev) => prev.map((l) => l._key === key ? { ...l, address, lat, lng } : l));
    } else {
      setLocations((prev) => [...prev, { _key: nk(), address, lat, lng, propertyGroups: [emptyPropertyGroup()] }]);
    }
  }

  function removeLocation(locationKey: string) {
    setLocations((prev) => prev.filter((l) => l._key !== locationKey));
  }

  function addPropertyGroup(locationKey: string) {
    setLocations((current) => current.map((location) =>
      location._key === locationKey
        ? { ...location, propertyGroups: [...location.propertyGroups, emptyPropertyGroup()] }
        : location
    ));
  }

  function removePropertyGroup(locationKey: string, propertyKey: string) {
    setLocations((current) => current.map((location) => {
      if (location._key !== locationKey || location.propertyGroups.length === 1) return location;
      return { ...location, propertyGroups: location.propertyGroups.filter((group) => group._key !== propertyKey) };
    }));
  }

  function updatePropertyGroup(locationKey: string, propertyKey: string, value: string) {
    setLocations((current) => current.map((location) => {
      if (location._key !== locationKey) return location;
      return {
        ...location,
        propertyGroups: location.propertyGroups.map((group) =>
          group._key === propertyKey ? { ...group, propertyType: value } : group
        ),
      };
    }));
  }

  function addAsset(locationKey: string, propertyKey: string) {
    setLocations((current) => current.map((location) => {
      if (location._key !== locationKey) return location;
      return {
        ...location,
        propertyGroups: location.propertyGroups.map((group) =>
          group._key === propertyKey ? { ...group, assets: [...group.assets, emptyAsset()] } : group
        ),
      };
    }));
  }

  function removeAsset(locationKey: string, propertyKey: string, assetKey: string) {
    setLocations((current) => current.map((location) => {
      if (location._key !== locationKey) return location;
      return {
        ...location,
        propertyGroups: location.propertyGroups.map((group) => {
          if (group._key !== propertyKey || group.assets.length === 1) return group;
          return { ...group, assets: group.assets.filter((asset) => asset._key !== assetKey) };
        }),
      };
    }));
  }

  function updateAsset(locationKey: string, propertyKey: string, assetKey: string, patch: Partial<AssetInput>) {
    setLocations((current) => current.map((location) => {
      if (location._key !== locationKey) return location;
      return {
        ...location,
        propertyGroups: location.propertyGroups.map((group) =>
          group._key === propertyKey
            ? {
                ...group,
                assets: group.assets.map((asset) =>
                  asset._key === assetKey ? { ...asset, ...patch } : asset
                ),
              }
            : group
        ),
      };
    }));
  }

  function selectAssetCategory(locationKey: string, propertyKey: string, assetKey: string, categoryId: string) {
    const price = categoryById.get(categoryId)?.price;
    updateAsset(locationKey, propertyKey, assetKey, {
      jobCategoryId: categoryId,
      unitPrice: price != null ? String(price) : "",
    });
  }

  function toggleTeam(teamId: string) {
    setTeamIds((prev) =>
      prev.includes(teamId)
        ? prev.filter((id) => id !== teamId)
        : [...prev, teamId]
    );
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    // Minimum to set an appointment: customer + job title + date + time.
    // Team, work location and assets are optional and can be filled in later.
    if (!customerId) { setError("Please select a customer."); return; }
    if (!jobTitle.trim()) { setError("Please enter a job title."); return; }
    if (!date) { setError("Please select a date."); return; }
    if (!time) { setError("Please select a start time."); return; }

    // If the date is today, the start time cannot be in the past.
    const nd = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const todayStr = `${nd.getFullYear()}-${pad(nd.getMonth() + 1)}-${pad(nd.getDate())}`;
    if (!allowPastSchedule && timeFinish && timeFinish < time) { setError("The finish time must be after the start time."); return; }

    startTransition(async () => {
      try {
        // Keep the appointment-level work location aligned with the selected customer
        // address even before any assets are added.
        const primaryAssetLocation = validAssets.find((asset) => asset.workLocationLat !== null && asset.workLocationLng !== null);
        const primarySavedLocation = locations.find((location) => location.address.trim());
        const primaryAddress = primaryAssetLocation?.workLocationAddress ?? primarySavedLocation?.address ?? "";
        const primaryLat = primaryAssetLocation?.workLocationLat ?? primarySavedLocation?.lat ?? null;
        const primaryLng = primaryAssetLocation?.workLocationLng ?? primarySavedLocation?.lng ?? null;
        const assets = validAssets.map((asset) => ({
          id: asset.id,
          label: asset.label,
          acType: asset.acType,
          jobCategoryId: asset.jobCategoryId,
          unitPrice: asset.unitPrice,
          billingType: asset.billingType,
          remarks: asset.remarks,
          additionalAddress: asset.workLocationAddress === primaryAddress ? undefined : asset.workLocationAddress,
          propertyType: asset.propertyType,
          workLocationAddress: asset.workLocationAddress,
          workLocationLat: asset.workLocationLat,
          workLocationLng: asset.workLocationLng,
        }));

        if (isEdit && editing) {
          const res = await fetch(`/api/appointments/${editing.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jobTitle: jobTitle.trim(), date, time, timeFinish, teamIds,
              locationAddress: primaryAddress, locationLat: primaryLat, locationLng: primaryLng,
              billingType, warrantyNote: warrantyNote.trim() || undefined,
              status, assets,
            }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Could not update appointment.");
        } else {
          const created = await createAppointment({
            customerId, jobTitle: jobTitle.trim(), date, time, timeFinish, teamIds, parentId,
            locationAddress: primaryAddress, locationLat: primaryLat, locationLng: primaryLng,
            billingType, warrantyNote: warrantyNote.trim() || undefined,
            assets,
          });
          onSaved?.({ date, appointmentId: created.id });
        }
        clearDrafts();
        if (isEdit) onSaved?.({ date });
        router.refresh();
        onClose();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "An error occurred.");
      }
    });
  }

  if (!open) return null;

  const heading = isEdit ? "Edit Appointment" : isSubJob ? "Create Sub Job" : "Add Appointment";
  const now = new Date();
  const todayISO = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const isToday = date === todayISO;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="font-semibold text-gray-900">{heading}</h2>
          <button type="button" onClick={handleModalClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 px-5 py-5 space-y-5" noValidate>
          {/* 1. Customer */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required
              disabled={(!!preselectedCustomerId && !isEdit) || isSubJob}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
              {/* Placeholder so the dropdown doesn't show the first customer as if selected
                  when none is chosen yet — otherwise teams/locations/assets stay hidden. */}
              {!preselectedCustomerId && !isSubJob && !isEdit && (
                <option value="">— Select a customer —</option>
              )}
              {selectableCustomers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name ? `${customer.name} - ${customer.phone}` : customer.phone}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Job Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Job Title</label>
            <input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} required
              placeholder="e.g. Master bedroom installation"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {/* 3. Teams (optional â€” can be assigned later) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Teams <span className="text-gray-400 font-normal">(optional)</span></label>
            {!customerId ? (
              <p className="text-sm text-gray-400 italic">Select a customer to list teams.</p>
            ) : availableTeams.length === 0 ? (
              <p className="mt-1 text-xs text-gray-400 italic">No team registered under this branch yet.</p>
            ) : (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setTeamMenuOpen((open) => !open)}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-left text-sm text-gray-700 transition hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <span className={teamIds.length === 0 ? "text-gray-400" : "text-gray-700"}>
                    {selectedTeamSummary}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${teamMenuOpen ? "rotate-180" : ""}`} />
                </button>
                {teamMenuOpen && (
                  <div className="grid gap-2 rounded-lg border border-gray-200 bg-white p-2 sm:grid-cols-2">
                    {availableTeams.map((team) => (
                      <label
                        key={team.id}
                        className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition cursor-pointer ${
                          teamIds.includes(team.id)
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-300 bg-white hover:border-blue-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={teamIds.includes(team.id)}
                          onChange={() => toggleTeam(team.id)}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="min-w-0">
                          <span className="block font-medium text-gray-800">{team.name}</span>
                          {team.members.length > 0 && (
                            <span className="block text-xs text-gray-500">
                              {team.members.map((m) => m.name).join(", ")}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4. Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input type="date" value={date} required onClick={openNativePicker}
              onChange={(e) => {
                const d = e.target.value;
                setDate(d);
                // Picking today with a now-past start bumps start to the next hour and finish to +1h.
                if (!allowPastSchedule && d === todayISO && (!time || time < nowHM)) {
                  const start = defaultStartForDate(d);
                  setTime(start);
                  setTimeFinish(addOneHour(start));
                }
              }}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer" />
          </div>

          {/* 5. Time start + finish */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time Start</label>
              <div className="lg:hidden">
                <MobileTimePickerInput
                  value={time}
                  ariaLabel="Time Start"
                  onChange={(v) => {
                    const start = !allowPastSchedule && v && isToday && v < nowHM ? nowHM : v;
                    setTime(start);
                    // Finish defaults to one hour after the start time.
                    if (start) setTimeFinish(addOneHour(start));
                  }}
                />
              </div>
              <div className="hidden lg:block">
                <TimeSpinnerInput
                  value={time}
                  ariaLabel="Time Start"
                  onChange={(v) => {
                    const start = !allowPastSchedule && v && isToday && v < nowHM ? nowHM : v;
                    setTime(start);
                    // Finish defaults to one hour after the start time.
                    if (start) setTimeFinish(addOneHour(start));
                  }}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Time Finish <span className="text-gray-400 font-normal">(optional)</span></label>
              <div className="lg:hidden">
                <MobileTimePickerInput
                  value={timeFinish}
                  ariaLabel="Time Finish"
                  onChange={setTimeFinish}
                />
              </div>
              <div className="hidden lg:block">
                <TimeSpinnerInput
                  value={timeFinish}
                  ariaLabel="Time Finish"
                  onChange={setTimeFinish}
                />
              </div>
            </div>
          </div>

          {/* 6. Work locations */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Work Locations <span className="text-gray-400 font-normal">(optional)</span></label>
              {customerId && (
                <button type="button" onClick={() => setLocationPicker({ mode: "add" })}
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                  <Plus className="w-3.5 h-3.5" /> Add Location
                </button>
              )}
            </div>
            {locations.length === 0 && (
              <p className="text-sm text-gray-400 italic">
                {customerId ? "No saved locations. Click \"Add Location\" to add one." : "Select a customer to load work locations."}
              </p>
            )}
          </div>

          {locations.map((location, locationIndex) => {
            const wazeLink = location.lat !== null && location.lng !== null
              ? `https://waze.com/ul?ll=${location.lat},${location.lng}&navigate=yes`
              : "";

            return (
              <div key={location._key} className="rounded-xl border border-gray-200 p-4 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">Work Location</label>
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => setLocationPicker({ mode: "edit", key: location._key })}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                      {locations.length > 1 && (
                        <button type="button" onClick={() => removeLocation(location._key)}
                          className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium">
                          <Trash2 className="w-3.5 h-3.5" /> Remove
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-400 mb-1">Location {locationIndex + 1}</p>
                      <p className="text-sm text-gray-700">{location.address}</p>
                      {wazeLink && (
                        <a href={wazeLink} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-2 text-xs text-cyan-600 hover:text-cyan-800 font-medium">
                          <Navigation className="w-3 h-3" /> Waze
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                {location.propertyGroups.map((propertyGroup, propertyIndex) => (
                  <div key={propertyGroup._key} className={propertyIndex > 0 ? "border-t border-gray-100 pt-4 space-y-4" : "space-y-4"}>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700">Property Type</label>
                        {propertyIndex === 0 ? (
                          <button type="button" onClick={() => addPropertyGroup(location._key)}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                            <Plus className="w-3.5 h-3.5" /> Add Property
                          </button>
                        ) : (
                          <button type="button" onClick={() => removePropertyGroup(location._key, propertyGroup._key)}
                            className="inline-flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-medium">
                            <Trash2 className="w-3.5 h-3.5" /> Remove Property
                          </button>
                        )}
                      </div>
                        <select value={propertyGroup.propertyType} onChange={(e) => updatePropertyGroup(location._key, propertyGroup._key, e.target.value)}
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {PROPERTY_TYPE_OPTIONS.map((propertyType) => (
                          <option key={propertyType.value} value={propertyType.value}>{propertyType.label}</option>
                        ))}
                      </select>
                    </div>

                    {propertyGroup.propertyType && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-sm font-medium text-gray-700">Assets / Units</label>
                          <button type="button" onClick={() => addAsset(location._key, propertyGroup._key)}
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium">
                            <Plus className="w-3.5 h-3.5" /> Add Asset
                          </button>
                        </div>
                        <div className="space-y-3">
                          {propertyGroup.assets.map((asset, assetIndex) => (
                            <div key={asset._key} className="rounded-lg border border-gray-200 p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium text-gray-400">Asset {assetIndex + 1}</p>
                                <button type="button" onClick={() => removeAsset(location._key, propertyGroup._key, asset._key)} disabled={propertyGroup.assets.length === 1}
                                  className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition disabled:opacity-30">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <select value={asset.acType} onChange={(e) => updateAsset(location._key, propertyGroup._key, asset._key, { acType: e.target.value })}
                                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                  {AC_TYPES.map((acType) => <option key={acType} value={acType}>{acType}</option>)}
                                </select>
                                <input value={asset.label} onChange={(e) => updateAsset(location._key, propertyGroup._key, asset._key, { label: e.target.value })}
                                  placeholder="Label (optional) - e.g. Bedroom"
                                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <select value={asset.jobCategoryId} onChange={(e) => selectAssetCategory(location._key, propertyGroup._key, asset._key, e.target.value)}
                                  className="px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                                  <option value="" disabled>Select category</option>
                                  {categories.map((category) => (
                                    <option key={category.id} value={category.id}>{category.name}</option>
                                  ))}
                                </select>
                                <div className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 focus-within:ring-2 focus-within:ring-blue-500">
                                  <span className="text-sm text-gray-400">RM</span>
                                  <input type="number" min="0" step="0.01" value={asset.unitPrice}
                                    onChange={(e) => updateAsset(location._key, propertyGroup._key, asset._key, { unitPrice: e.target.value })}
                                    placeholder="0.00"
                                    className="w-full text-sm focus:outline-none" />
                                </div>
                              </div>
                              <input value={asset.remarks} onChange={(e) => updateAsset(location._key, propertyGroup._key, asset._key, { remarks: e.target.value })}
                                placeholder="Remarks (optional)"
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Billing Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBillingType("CHARGEABLE")}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                  billingType === "CHARGEABLE"
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-300 bg-white text-gray-600 hover:border-blue-300"
                }`}
              >
                Chargeable
              </button>
              <button
                type="button"
                onClick={() => setBillingType("WARRANTY")}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition ${
                  billingType === "WARRANTY"
                    ? "border-[#28a89d] bg-teal-50 text-[#1f8c82]"
                    : "border-gray-300 bg-white text-gray-600 hover:border-teal-300"
                }`}
              >
                Warranty / FOC
              </button>
            </div>
            {billingType === "WARRANTY" && (
              <div className="space-y-2 rounded-xl border border-teal-100 bg-teal-50 p-3">
                <p className="text-sm font-medium text-teal-800">No payment will be collected for this appointment.</p>
                <textarea
                  value={warrantyNote}
                  onChange={(e) => setWarrantyNote(e.target.value)}
                  rows={2}
                  placeholder="Warranty note (optional)"
                  className="w-full resize-none rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#28a89d]"
                />
              </div>
            )}
          </div>

          {isEdit && canManageCompletion && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                {STATUS_OPTS.map((statusOption) => <option key={statusOption.value} value={statusOption.value}>{statusOption.label}</option>)}
              </select>
            </div>
          )}

          <div className="bg-blue-50 rounded-xl px-4 py-3 border border-blue-100">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-blue-700">{validAssets.length} unit(s)</div>
              <div className="text-right">
                <div className="text-lg font-bold text-blue-900">{totalPrice <= 0 ? "FOC" : `RM ${totalPrice.toFixed(2)}`}</div>
                {billingType === "WARRANTY" && (
                  <div className="text-xs font-medium text-teal-700">
                    {totalPrice <= 0 ? "Warranty" : "Warranty + chargeable items"}
                  </div>
                )}
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-1 pb-2">
            <button type="button" onClick={handleModalClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition">
              Cancel
            </button>
            <button type="submit" disabled={pending}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#28a89d] hover:bg-[#1f8c82] disabled:bg-[#28a89d]/50 text-white text-sm font-medium transition">
              {pending ? <><Loader2 className="w-4 h-4 animate-spin" />Saving...</> : isEdit ? "Update" : isSubJob ? "Create Sub Job" : "Save Appointment"}
            </button>
          </div>
        </form>
      </div>

      {locationPicker && (
        <AddressPickerModal
          onAdd={commitLocation}
          onClose={() => setLocationPicker(null)}
        />
      )}
    </div>
  );
}
