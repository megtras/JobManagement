"use client";

import { useMemo, useState, useTransition } from "react";
import {
  BarChart3,
  CalendarPlus,
  CheckCircle2,
  Eye,
  Filter,
  Megaphone,
  MessageCircle,
  Phone,
  Search,
  Target,
  UserPlus,
  X,
} from "lucide-react";
import type {
  WebsiteLead,
  WebsiteLeadMessage,
  WebsiteLeadStatus,
} from "@/generated/prisma/client";
import { AppointmentModal } from "@/components/appointments/AppointmentModal";
import { CustomerModal } from "@/components/customers/CustomerModal";
import {
  linkWebsiteLeadAppointment,
  linkWebsiteLeadCustomer,
  updateWebsiteLeadStatus,
} from "@/lib/actions/website-leads";

const EXTERNAL_WHATSAPP_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_EXTERNAL_WHATSAPP === "true";

type LeadRow = WebsiteLead & { messages: WebsiteLeadMessage[] };
interface Branch { id: string; name: string }
interface Category { id: string; name: string; price: number }
interface CustomerAddress { id?: string; address: string; lat: number | null; lng: number | null }
interface CustomerOpt {
  id: string;
  name: string;
  phone: string;
  branchId: string;
  propertyType: string;
  status?: string;
  addresses: CustomerAddress[];
}
interface TeamOpt {
  id: string;
  name: string;
  branchId: string;
  members: { id: string; name: string }[];
}

interface Props {
  leads: LeadRow[];
  branches: Branch[];
  customers: CustomerOpt[];
  categories: Category[];
  teams: TeamOpt[];
  defaultBranchId: string | null;
}

const STATUS_LABEL: Record<WebsiteLeadStatus, string> = {
  NEW_ENQUIRY: "New enquiry",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  QUOTATION_SENT: "Quotation sent",
  APPOINTMENT_CONFIRMED: "Appointment confirmed",
  CONVERTED_TO_JOB: "Converted to job",
  JOB_COMPLETED: "Job completed",
  CLOSED: "Closed",
};

const STATUS_CLASS: Record<WebsiteLeadStatus, string> = {
  NEW_ENQUIRY: "bg-blue-50 text-blue-700",
  CONTACTED: "bg-cyan-50 text-cyan-700",
  QUALIFIED: "bg-violet-50 text-violet-700",
  QUOTATION_SENT: "bg-amber-50 text-amber-700",
  APPOINTMENT_CONFIRMED: "bg-indigo-50 text-indigo-700",
  CONVERTED_TO_JOB: "bg-teal-50 text-teal-700",
  JOB_COMPLETED: "bg-green-50 text-green-700",
  CLOSED: "bg-gray-100 text-gray-600",
};

const ALL_STATUSES = Object.keys(STATUS_LABEL) as WebsiteLeadStatus[];

export function WebsiteLeadsClient({
  leads,
  branches,
  customers,
  categories,
  teams,
  defaultBranchId,
}: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<WebsiteLeadStatus | "ALL">("ALL");
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [customerLeadId, setCustomerLeadId] = useState<string | null>(null);
  const [appointmentState, setAppointmentState] = useState<{
    leadId: string;
    customerId: string;
  } | null>(null);
  const [notice, setNotice] = useState("");
  const [linkPending, startLinkTransition] = useTransition();

  const selectedLead =
    leads.find((lead) => lead.id === selectedLeadId) ?? null;
  const customerLead =
    leads.find((lead) => lead.id === customerLeadId) ?? null;
  const customerInitialValues = useMemo(
    () =>
      customerLead
        ? {
            name: customerLead.name,
            phone: customerLead.phone,
            email: customerLead.email ?? "",
            area: confirmedValue(customerLead.serviceArea),
            custType: customerTypeValue(customerLead.customerType),
            propertyType: propertyTypeValue(customerLead.propertyType),
          }
        : undefined,
    [customerLead]
  );

  const filtered = useMemo(() => {
    const term = query.toLowerCase().trim();
    return leads.filter((lead) => {
      const matchesStatus = status === "ALL" || lead.status === status;
      const matchesQuery =
        !term ||
        [
          lead.name,
          lead.phone,
          lead.serviceType,
          lead.serviceArea,
          lead.leadSource,
          lead.utmCampaign,
        ]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(term));
      return matchesStatus && matchesQuery;
    });
  }, [leads, query, status]);

  const completed = leads.filter((lead) =>
    ["CONVERTED_TO_JOB", "JOB_COMPLETED"].includes(lead.status)
  ).length;
  const conversionRate = leads.length
    ? Math.round((completed / leads.length) * 100)
    : 0;
  const adLeads = leads.filter(
    (lead) =>
      lead.leadSource === "google_ads" ||
      Boolean(lead.gclid || lead.gbraid || lead.wbraid)
  ).length;
  const whatsappLeads = leads.filter(
    (lead) => lead.conversionMethod === "WHATSAPP"
  ).length;

  function linkCustomer(leadId: string, customerId: string) {
    startLinkTransition(async () => {
      try {
        await linkWebsiteLeadCustomer(leadId, customerId);
        setNotice("Customer linked to the website lead.");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not link customer.");
      }
    });
  }

  function openAppointment(leadId: string, customerId: string) {
    linkCustomer(leadId, customerId);
    setCustomerLeadId(null);
    setAppointmentState({ leadId, customerId });
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Target className="size-6 text-teal-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Website Leads</h1>
          <p className="text-sm text-gray-500">
            Website forms, inbound WhatsApp and lead-to-job follow-up
          </p>
        </div>
      </div>

      {notice && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Total leads" value={leads.length} icon={BarChart3} />
        <Stat
          label="New enquiries"
          value={leads.filter((lead) => lead.status === "NEW_ENQUIRY").length}
          icon={Filter}
        />
        <Stat label="WhatsApp leads" value={whatsappLeads} icon={MessageCircle} />
        <Stat label="Google Ads leads" value={adLeads} icon={Megaphone} />
        <Stat
          label="Lead-to-job rate"
          value={`${conversionRate}%`}
          icon={CheckCircle2}
        />
      </div>

      <div className="mt-6 flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row">
        <label className="relative flex-1">
          <Search className="absolute left-3 top-3 size-4 text-gray-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, phone, service, area or campaign"
            className="h-10 w-full rounded-md border border-gray-300 pl-9 pr-3 text-sm outline-none focus:border-teal-600"
          />
        </label>
        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as WebsiteLeadStatus | "ALL")
          }
          className="h-10 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-teal-600"
        >
          <option value="ALL">All statuses</option>
          {ALL_STATUSES.map((item) => (
            <option key={item} value={item}>
              {STATUS_LABEL[item]}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4 hidden overflow-x-auto rounded-lg border border-gray-200 bg-white lg:block">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Lead</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Service / area</th>
              <th className="px-4 py-3">Source / campaign</th>
              <th className="px-4 py-3">Submitted</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((lead) => (
              <tr key={lead.id} className="align-top hover:bg-gray-50">
                <td className="px-4 py-4">
                  <p className="font-semibold text-gray-900">{lead.name}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    WL-{String(lead.leadNo).padStart(5, "0")}
                  </p>
                </td>
                <td className="px-4 py-4">
                  <a
                    href={`tel:${lead.phone}`}
                    className="flex items-center gap-1 font-medium text-teal-700"
                  >
                    <Phone className="size-3.5" />
                    {lead.phone}
                  </a>
                  {lead.email && (
                    <p className="mt-1 text-xs text-gray-500">{lead.email}</p>
                  )}
                </td>
                <td className="px-4 py-4 text-gray-700">
                  <p>{formatValue(lead.serviceType)}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {formatValue(lead.serviceArea)} · {formatValue(lead.unitQuantityRange)}
                  </p>
                </td>
                <td className="px-4 py-4 text-gray-700">
                  <p>{formatValue(lead.leadSource)}</p>
                  <p className="mt-1 text-xs text-gray-500">
                    {lead.utmCampaign || "No campaign"}
                  </p>
                </td>
                <td className="px-4 py-4 text-gray-600">
                  {formatDate(lead.createdAt)}
                </td>
                <td className="px-4 py-4">
                  <StatusSelect lead={lead} />
                </td>
                <td className="px-4 py-4">
                  <LeadActions
                    lead={lead}
                    onView={() => setSelectedLeadId(lead.id)}
                    onAddCustomer={() => setCustomerLeadId(lead.id)}
                    onAddAppointment={() =>
                      lead.customerId &&
                      setAppointmentState({
                        leadId: lead.id,
                        customerId: lead.customerId,
                      })
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="p-8 text-center text-sm text-gray-500">No leads found.</p>
        )}
      </div>

      <div className="mt-4 grid gap-3 lg:hidden">
        {filtered.map((lead) => (
          <article
            key={lead.id}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-900">{lead.name}</p>
                <p className="text-xs text-gray-400">
                  WL-{String(lead.leadNo).padStart(5, "0")} ·{" "}
                  {formatDate(lead.createdAt)}
                </p>
              </div>
              <span
                className={`rounded-full px-2 py-1 text-[11px] font-semibold ${STATUS_CLASS[lead.status]}`}
              >
                {STATUS_LABEL[lead.status]}
              </span>
            </div>
            <div className="mt-4 grid gap-2 text-sm text-gray-600">
              <a href={`tel:${lead.phone}`} className="font-medium text-teal-700">
                {lead.phone}
              </a>
              <p>
                {formatValue(lead.serviceType)} · {formatValue(lead.serviceArea)}
              </p>
              <p>Source: {formatValue(lead.leadSource)}</p>
            </div>
            <div className="mt-4">
              <StatusSelect lead={lead} />
            </div>
            <div className="mt-3 border-t border-gray-100 pt-3">
              <LeadActions
                lead={lead}
                onView={() => setSelectedLeadId(lead.id)}
                onAddCustomer={() => setCustomerLeadId(lead.id)}
                onAddAppointment={() =>
                  lead.customerId &&
                  setAppointmentState({
                    leadId: lead.id,
                    customerId: lead.customerId,
                  })
                }
              />
            </div>
          </article>
        ))}
      </div>

      {selectedLead && (
        <LeadDrawer
          lead={selectedLead}
          onClose={() => setSelectedLeadId(null)}
          onAddCustomer={() => setCustomerLeadId(selectedLead.id)}
          onAddAppointment={() =>
            selectedLead.customerId &&
            setAppointmentState({
              leadId: selectedLead.id,
              customerId: selectedLead.customerId,
            })
          }
        />
      )}

      <CustomerModal
        open={Boolean(customerLead)}
        onClose={() => setCustomerLeadId(null)}
        branches={branches}
        defaultBranchId={defaultBranchId ?? undefined}
        initialValues={customerInitialValues}
        onCreated={(customerId) => {
          if (customerLead) linkCustomer(customerLead.id, customerId);
        }}
        onDuplicateAppointment={(customerId) => {
          if (customerLead) openAppointment(customerLead.id, customerId);
        }}
      />

      <AppointmentModal
        open={Boolean(appointmentState)}
        onClose={() => setAppointmentState(null)}
        categories={categories}
        customers={customers}
        teams={teams}
        preselectedCustomerId={appointmentState?.customerId}
        onSaved={(saved) => {
          if (!appointmentState || !saved?.appointmentId) return;
          startLinkTransition(async () => {
            try {
              await linkWebsiteLeadAppointment(
                appointmentState.leadId,
                saved.appointmentId!
              );
              setNotice("Appointment created and linked to the website lead.");
            } catch (error) {
              setNotice(
                error instanceof Error
                  ? error.message
                  : "Could not link appointment."
              );
            }
          });
        }}
      />

      {linkPending && (
        <div className="fixed bottom-5 right-5 rounded-md bg-gray-900 px-4 py-2 text-xs font-medium text-white shadow-lg">
          Updating lead…
        </div>
      )}
    </div>
  );
}

function LeadActions({
  lead,
  onView,
  onAddCustomer,
  onAddAppointment,
}: {
  lead: LeadRow;
  onView: () => void;
  onAddCustomer: () => void;
  onAddAppointment: () => void;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <a
        href={whatsappUrl(lead)}
        target="_blank"
        rel="noreferrer"
        aria-label={`WhatsApp ${lead.name}`}
        title="WhatsApp lead"
        className="grid size-9 place-items-center rounded-md text-green-700 hover:bg-green-50"
      >
        <MessageCircle className="size-4" />
      </a>
      <button
        type="button"
        onClick={onView}
        aria-label={`View WL-${lead.leadNo}`}
        title="View lead"
        className="grid size-9 place-items-center rounded-md text-gray-600 hover:bg-gray-100"
      >
        <Eye className="size-4" />
      </button>
      {lead.customerId ? (
        <button
          type="button"
          onClick={onAddAppointment}
          aria-label={`Add appointment for ${lead.name}`}
          title="Add appointment"
          className="grid size-9 place-items-center rounded-md text-teal-700 hover:bg-teal-50"
        >
          <CalendarPlus className="size-4" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onAddCustomer}
          aria-label={`Add ${lead.name} as customer`}
          title="Add customer"
          className="grid size-9 place-items-center rounded-md text-blue-700 hover:bg-blue-50"
        >
          <UserPlus className="size-4" />
        </button>
      )}
    </div>
  );
}

function LeadDrawer({
  lead,
  onClose,
  onAddCustomer,
  onAddAppointment,
}: {
  lead: LeadRow;
  onClose: () => void;
  onAddCustomer: () => void;
  onAddAppointment: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/35" onMouseDown={onClose}>
      <aside
        className="ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-200 px-5 py-4">
          <div>
            <p className="text-xs font-medium text-teal-700">
              WL-{String(lead.leadNo).padStart(5, "0")}
            </p>
            <h2 className="mt-1 text-xl font-bold text-gray-900">{lead.name}</h2>
            <p className="mt-1 text-xs text-gray-500">{formatDate(lead.createdAt)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close lead details"
            className="grid size-9 place-items-center rounded-md text-gray-500 hover:bg-gray-100"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Detail label="Phone" value={lead.phone} />
            <Detail label="Email" value={lead.email || "Not provided"} />
            <Detail label="Service" value={formatValue(lead.serviceType)} />
            <Detail label="Area" value={formatValue(lead.serviceArea)} />
            <Detail label="Customer type" value={formatValue(lead.customerType)} />
            <Detail label="Property" value={formatValue(lead.propertyType)} />
            <Detail label="Units" value={formatValue(lead.unitQuantityRange)} />
            <Detail label="Language" value={formatValue(lead.websiteLanguage)} />
          </div>

          <div className="mt-6 border-t border-gray-200 pt-5">
            <h3 className="text-sm font-semibold text-gray-900">Lead source</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Detail label="Source" value={formatValue(lead.leadSource)} />
              <Detail label="Method" value={formatValue(lead.conversionMethod)} />
              <Detail label="Campaign" value={lead.utmCampaign || "No campaign"} />
              <Detail label="Landing page" value={lead.firstLandingPage || "Not captured"} />
            </div>
          </div>

          <div className="mt-6 border-t border-gray-200 pt-5">
            <h3 className="text-sm font-semibold text-gray-900">
              {lead.messages.length ? "Inbound messages" : "Customer message"}
            </h3>
            {lead.messages.length ? (
              <div className="mt-3 space-y-3">
                {[...lead.messages].reverse().map((message) => (
                  <div key={message.id} className="rounded-lg bg-gray-50 p-3">
                    <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                      {message.content || `[${formatValue(message.messageType)}]`}
                    </p>
                    <p className="mt-2 text-[11px] text-gray-400">
                      {formatDate(message.receivedAt)}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-sm leading-6 text-gray-700">
                {lead.message || "No message provided."}
              </p>
            )}
          </div>
        </div>

        <div className="grid gap-2 border-t border-gray-200 p-4 sm:grid-cols-3">
          <a
            href={`tel:${lead.phone}`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <Phone className="size-4" /> Call
          </a>
          <a
            href={whatsappUrl(lead)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md border border-green-300 text-sm font-semibold text-green-700 hover:bg-green-50"
          >
            <MessageCircle className="size-4" /> WhatsApp
          </a>
          {lead.customerId ? (
            <button
              type="button"
              onClick={onAddAppointment}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-teal-600 text-sm font-semibold text-white hover:bg-teal-700"
            >
              <CalendarPlus className="size-4" /> Appointment
            </button>
          ) : (
            <button
              type="button"
              onClick={onAddCustomer}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-teal-600 text-sm font-semibold text-white hover:bg-teal-700"
            >
              <UserPlus className="size-4" /> Add customer
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function StatusSelect({ lead }: { lead: LeadRow }) {
  const [pending, startTransition] = useTransition();
  const [current, setCurrent] = useState(lead.status);

  return (
    <select
      aria-label={`Status for WL-${lead.leadNo}`}
      value={current}
      disabled={pending}
      onChange={(event) => {
        const next = event.target.value as WebsiteLeadStatus;
        setCurrent(next);
        startTransition(async () => {
          try {
            await updateWebsiteLeadStatus(lead.id, next);
          } catch {
            setCurrent(lead.status);
          }
        });
      }}
      className={`h-9 rounded-md border-0 px-2 text-xs font-semibold outline-none ring-1 ring-inset ring-gray-200 ${STATUS_CLASS[current]}`}
    >
      {ALL_STATUSES.map((item) => (
        <option key={item} value={item}>
          {STATUS_LABEL[item]}
        </option>
      ))}
    </select>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="grid size-10 place-items-center rounded-md bg-teal-50 text-teal-700">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase text-gray-400">{label}</p>
      <p className="mt-1 break-words text-sm font-medium text-gray-800">{value}</p>
    </div>
  );
}

function confirmedValue(value: string) {
  return value === "not-confirmed" ? "" : formatValue(value);
}

function customerTypeValue(value: string) {
  if (value.toLowerCase().includes("corporate")) return "CORPORATE";
  if (value === "not-confirmed") return "";
  return "END_USER";
}

function propertyTypeValue(value: string) {
  const normalized = value.toUpperCase().replace(/[-\s]/g, "_");
  return ["CONDO", "LANDED", "OFFICE", "FACTORY", "OTHERS"].includes(normalized)
    ? normalized
    : "";
}

function whatsappUrl(lead: LeadRow) {
  if (!EXTERNAL_WHATSAPP_ENABLED) return "#";
  const phone = lead.phone.replace(/\D/g, "");
  const reference = `WL-${String(lead.leadNo).padStart(5, "0")}`;
  const message = `Hi ${lead.name}, this is GenPlus Aircond following up on enquiry ${reference}.`;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function formatValue(value: string) {
  if (value === "not-confirmed") return "Not confirmed";
  return value
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: Date) {
  return new Date(value).toLocaleString("en-MY", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
