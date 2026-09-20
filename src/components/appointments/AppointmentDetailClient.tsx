"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  MapPin, Clock, Navigation, ExternalLink, Building2,
  CheckCircle2, Camera, CreditCard, FileText, Download,
  Loader2, AlertCircle, AlertTriangle, X, Phone, Mail,
  Users, CopyPlus, Pencil, Save,
} from "lucide-react";
import { AppointmentModal } from "./AppointmentModal";
import { ReportAssetEditor, type ReportAssetDraft } from "./ReportAssetEditor";
import { resolveUrgent } from "@/lib/actions/appointments";
import { isPdfReceiptUrl } from "@/lib/receipt-files";
import { normalizeUploadUrl } from "@/lib/upload-urls";
import { buildWazeLink } from "@/lib/waze";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Asset {
  id: string;
  label: string;
  acType?: string | null;
  unitPrice?: string | number | null;
  billingType?: "CHARGEABLE" | "WARRANTY" | null;
  remarks?: string | null;
  technicianRemark?: string | null;
  jobCategory?: { id?: string; name: string } | null;
  jobCategoryId?: string | null;
  additionalAddress?: string | null;
  propertyType?: string | null;
  workLocationAddress?: string | null;
  workLocationLat?: number | null;
  workLocationLng?: number | null;
}
interface TeamMember { id: string; name: string; phone?: string | null }
interface TeamRef { id: string; name: string; members: TeamMember[] }
interface SubJobRef { id: string; jobTitle: string; status: string; date: string }

interface CategoryOpt { id: string; name: string; price: number }
interface CustomerAddressOpt { id?: string; address: string; lat: number | null; lng: number | null }
interface CustomerOpt { id: string; name: string; phone: string; branchId: string; propertyType: string; status?: string; addresses: CustomerAddressOpt[] }
interface TeamOpt { id: string; name: string; branchId: string; members: { id: string; name: string }[] }
interface ServicePhoto { id: string; photoUrl: string; type: string; assetId?: string | null; label?: string | null }
interface Payment {
  id: string; method: string; amount: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  receiptPhotoUrl?: string | null; rejectReason?: string | null;
  createdAt: string;
  approvedBy: { name: string } | null;
}

interface Appt {
  id: string;
  customerId: string;
  date: string;
  time: string;
  timeFinish?: string | null;
  status: string;
  urgent?: boolean | null;
  urgentReason?: string | null;
  checkInSosRequestedAt?: string | null;
  checkInSosRequestedById?: string | null;
  checkInSosAddress?: string | null;
  checkInSosLat?: number | null;
  checkInSosLng?: number | null;
  checkInSosResolvedAt?: string | null;
  checkInSosResolvedById?: string | null;
  checkInSosRequester?: { id: string; name: string } | null;
  checkInSosResolver?: { id: string; name: string } | null;
  approvedAt?: string | null;
  locationAddress: string;
  locationLat: number;
  locationLng: number;
  locationWazeLink: string;
  totalPrice: string;
  billingType: "CHARGEABLE" | "WARRANTY";
  warrantyNote?: string | null;
  jobTitle: string;
  customer: { name: string; phone: string; phone2?: string | null; email?: string | null; area: string; propertyType?: string | null };
  branch: { name: string };
  jobCategory: { name: string } | null;
  technician: { id: string; name: string; phone?: string | null } | null;
  teams: TeamRef[];
  parent: { id: string; jobTitle: string } | null;
  subJobs: SubJobRef[];
  assets: Asset[];
  checkIns: { checkedInAt: string }[];
  servicePhotos: ServicePhoto[];
  payments: Payment[];
  report: {
    technicianName: string;
    clientName: string;
    pdfUrl?: string | null;
    reportDate: string;
  } | null;
}

interface PropertyAssetGroup {
  propertyType: string;
  assets: Asset[];
}

interface WorkLocationGroup {
  address: string;
  lat: number | null;
  lng: number | null;
  propertyGroups: PropertyAssetGroup[];
}

interface ReportEditDraft {
  technicianName: string;
  clientName: string;
  reportDate: string;
  assets: ReportAssetDraft[];
  photos: Array<{ id: string; label: string; assetId: string | null; isNew?: boolean }>;
  deletedAssetIds: string[];
  deletedPhotoIds: string[];
}

interface ReportFeedback {
  tone: "success" | "warning" | "error";
  message: string;
}

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  COMING_SOON: { label: "Upcoming", className: "bg-blue-100 text-blue-700" },
  IN_PROGRESS: { label: "In Progress", className: "bg-amber-100 text-amber-700" },
  DONE: { label: "Done", className: "bg-green-100 text-green-700" },
};

const METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  QR_TRANSFER: "QR / Transfer",
  OFFICE: "Pay at Office",
};

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, icon: Icon, children }: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-700">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function cleanText(value?: string | null) {
  return value?.trim() ?? "";
}

function reportDateInputValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildAppointmentWorkLocations(appt: Appt): WorkLocationGroup[] {
  const fallbackAddress = cleanText(appt.locationAddress) || "No address recorded";
  const fallbackPropertyType = cleanText(appt.customer.propertyType) || "Property";
  const byAddress = new Map<string, WorkLocationGroup>();

  function ensureLocation(address: string, lat: number | null, lng: number | null) {
    if (!byAddress.has(address)) {
      byAddress.set(address, { address, lat, lng, propertyGroups: [] });
    }
    const location = byAddress.get(address)!;
    if (location.lat == null && lat != null) location.lat = lat;
    if (location.lng == null && lng != null) location.lng = lng;
    return location;
  }

  for (const asset of appt.assets) {
    const address = cleanText(asset.workLocationAddress)
      || cleanText(asset.additionalAddress)
      || fallbackAddress;
    const location = ensureLocation(
      address,
      asset.workLocationLat ?? (address === fallbackAddress ? appt.locationLat : null),
      asset.workLocationLng ?? (address === fallbackAddress ? appt.locationLng : null)
    );
    const propertyType = cleanText(asset.propertyType) || fallbackPropertyType;
    let group = location.propertyGroups.find((item) => item.propertyType === propertyType);
    if (!group) {
      group = { propertyType, assets: [] };
      location.propertyGroups.push(group);
    }
    group.assets.push(asset);
  }

  if (byAddress.size === 0) {
    const location = ensureLocation(fallbackAddress, appt.locationLat, appt.locationLng);
    location.propertyGroups.push({ propertyType: fallbackPropertyType, assets: [] });
  }

  return Array.from(byAddress.values());
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AppointmentDetailClient({
  appointmentId,
  canApprovePayments,
  canEditReport,
  canManage = false,
  categories = [],
  customers = [],
  teams = [],
}: {
  appointmentId: string;
  canApprovePayments: boolean;
  canEditReport: boolean;
  canManage?: boolean;
  categories?: CategoryOpt[];
  customers?: CustomerOpt[];
  teams?: TeamOpt[];
}) {
  const [appt, setAppt] = useState<Appt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [subJobModal, setSubJobModal] = useState(false);
  const [actionError, setActionError] = useState("");
  const [pdfViewer, setPdfViewer] = useState<string | null>(null);
  const [pdfDownloadPending, setPdfDownloadPending] = useState(false);
  const [pdfOpenPending, setPdfOpenPending] = useState(false);
  const [useInAppPdfViewer, setUseInAppPdfViewer] = useState(false);
  const [compactPdfViewer, setCompactPdfViewer] = useState(false);
  const [officeReceiptPaymentId, setOfficeReceiptPaymentId] = useState<string | null>(null);
  const [officeReceiptFile, setOfficeReceiptFile] = useState<File | null>(null);
  const [officeReceiptPreviewUrl, setOfficeReceiptPreviewUrl] = useState("");
  const [officeReceiptSaving, setOfficeReceiptSaving] = useState<string | null>(null);
  const [pushCheckInLoading, setPushCheckInLoading] = useState(false);
  const [reportEditDraft, setReportEditDraft] = useState<ReportEditDraft | null>(null);
  const [reportSaving, setReportSaving] = useState(false);
  const [reportPhotoFiles, setReportPhotoFiles] = useState<Record<string, { file: File; preview: string }>>({});
  const reportPhotoPreviewUrls = useRef<string[]>([]);
  useEffect(() => () => {
    reportPhotoPreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);
  const [reportFeedback, setReportFeedback] = useState<ReportFeedback | null>(null);

  // Lightbox
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/appointments/${appointmentId}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Not found");
      setAppt(await res.json());
    } catch {
      setError("Could not load appointment details.");
    } finally {
      setLoading(false);
    }
  }, [appointmentId]);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- load appointment detail when the route id changes */
    void load();
  }, [load]);

  useEffect(() => {
    function updatePdfViewerMode() {
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches
        || window.matchMedia("(display-mode: fullscreen)").matches
        || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
      setUseInAppPdfViewer(isStandalone || window.innerWidth < 768);
      setCompactPdfViewer(isStandalone || window.innerWidth < 768);
    }

    updatePdfViewerMode();
    window.addEventListener("resize", updatePdfViewerMode);
    return () => window.removeEventListener("resize", updatePdfViewerMode);
  }, []);

  useEffect(() => {
    return () => {
      if (officeReceiptPreviewUrl) URL.revokeObjectURL(officeReceiptPreviewUrl);
    };
  }, [officeReceiptPreviewUrl]);

  function withCacheBuster(url: string) {
    const abs = normalizeUploadUrl(url);
    const href = abs.startsWith("http") ? abs : `${window.location.origin}${abs}`;
    const nextUrl = new URL(href);
    nextUrl.searchParams.set("v", String(Date.now()));
    return nextUrl.toString();
  }

  async function regenerateReportPdf(fallbackUrl: string) {
    try {
      const response = await fetch(`/api/appointments/${appointmentId}/report/regenerate`, {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not regenerate report");
      const data = await response.json() as { pdfUrl?: string };
      if (data.pdfUrl) {
        void load();
        return data.pdfUrl;
      }
    } catch {
      // Keep old PDFs reachable if regeneration fails for a legacy record.
    }
    return fallbackUrl;
  }

  async function handleOpenReportPdf(pdfUrl: string) {
    if (pdfOpenPending) return;
    // Pre-open a tab synchronously (so it isn't popup-blocked during the async
    // regenerate), then navigate THAT tab to the PDF. No "noopener" here — it would
    // make window.open return null and leave the blank tab orphaned.
    const popup = !useInAppPdfViewer ? window.open("about:blank", "_blank") : null;
    setPdfOpenPending(true);
    try {
      const freshUrl = await regenerateReportPdf(pdfUrl);
      const viewUrl = withCacheBuster(freshUrl);
      if (useInAppPdfViewer) {
        setPdfViewer(viewUrl);
      } else if (popup) {
        popup.location.href = viewUrl;
      } else {
        window.open(viewUrl, "_blank", "noopener,noreferrer");
      }
    } finally {
      setPdfOpenPending(false);
    }
  }

  async function handlePdfDownload() {
    if (!pdfViewer || pdfDownloadPending) return;
    setPdfDownloadPending(true);
    try {
      const response = await fetch(pdfViewer, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not prepare PDF (HTTP ${response.status})`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `service-report-${appointmentId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch {
      const link = document.createElement("a");
      link.href = pdfViewer;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      setPdfDownloadPending(false);
    }
  }

  const [resolvingUrgent, setResolvingUrgent] = useState(false);
  const handleResolveUrgent = async () => {
    if (!appt) return;
    setResolvingUrgent(true);
    setActionError("");
    try {
      await resolveUrgent(appt.id);
      await load();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Could not resolve");
    } finally {
      setResolvingUrgent(false);
    }
  };

  const [approving, setApproving] = useState(false);
  const handleApproveClose = async () => {
    if (!appt) return;
    if (!confirm(`Approve & close the job for "${appt.customer.name}"? This also approves the payment.`)) return;
    setApproving(true);
    setActionError("");
    try {
      const res = await fetch(`/api/appointments/${appt.id}/approve`, { method: "POST" });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Approve failed");
      await load();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Approve failed");
    } finally {
      setApproving(false);
    }
  };

  const handlePushCheckIn = async () => {
    if (!appt) return;
    setPushCheckInLoading(true);
    setActionError("");
    try {
      const res = await fetch(`/api/appointments/${appointmentId}/push-checkin`, { method: "POST" });
      const data = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not push check-in");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not push check-in");
    } finally {
      setPushCheckInLoading(false);
    }
  };

  function clearOfficeReceiptDraft() {
    if (officeReceiptPreviewUrl) URL.revokeObjectURL(officeReceiptPreviewUrl);
    setOfficeReceiptPaymentId(null);
    setOfficeReceiptFile(null);
    setOfficeReceiptPreviewUrl("");
  }

  function handleOfficeReceiptSelect(paymentId: string, file?: File | null) {
    if (!file) return;
    if (officeReceiptPreviewUrl) URL.revokeObjectURL(officeReceiptPreviewUrl);
    setOfficeReceiptPaymentId(paymentId);
    setOfficeReceiptFile(file);
    setOfficeReceiptPreviewUrl(URL.createObjectURL(file));
    setActionError("");
  }

  async function saveOfficeReceipt(paymentId: string) {
    if (!officeReceiptFile) {
      setActionError("Please choose a payment proof photo first.");
      return;
    }
    setOfficeReceiptSaving(paymentId);
    setActionError("");
    try {
      const form = new FormData();
      form.append("receipt", officeReceiptFile);
      const res = await fetch(`/api/payments/${paymentId}/receipt`, {
        method: "POST",
        body: form,
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not upload payment proof");
      clearOfficeReceiptDraft();
      await load();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Could not upload payment proof");
    } finally {
      setOfficeReceiptSaving(null);
    }
  }

  function beginReportEdit() {
    if (!appt?.report) return;
    clearReportPhotoPreviews();
    setReportPhotoFiles({});
    setReportFeedback(null);
    setReportEditDraft({
      technicianName: appt.report.technicianName,
      clientName: appt.report.clientName,
      reportDate: reportDateInputValue(appt.report.reportDate),
      assets: appt.assets.map((asset) => ({
        id: asset.id,
        label: asset.label,
        acType: asset.acType ?? "",
        jobCategoryId: asset.jobCategoryId ?? asset.jobCategory?.id ?? "",
        unitPrice: String(asset.unitPrice ?? 0),
        billingType: asset.billingType ?? "CHARGEABLE",
        remarks: asset.remarks ?? "",
        additionalAddress: asset.additionalAddress ?? "",
        propertyType: asset.propertyType ?? "",
        workLocationAddress: asset.workLocationAddress ?? "",
        technicianRemark: asset.technicianRemark ?? "",
      })),
      photos: appt.servicePhotos
        .filter((photo) => photo.type === "EVIDENCE")
        .map((photo) => ({ id: photo.id, label: photo.label ?? "", assetId: photo.assetId ?? null })),
      deletedAssetIds: [],
      deletedPhotoIds: [],
    });
  }

  function clearReportPhotoPreviews() {
    reportPhotoPreviewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    reportPhotoPreviewUrls.current = [];
  }

  function updateReportAsset(assetId: string, patch: Partial<ReportAssetDraft>) {
    setReportEditDraft((current) => current ? {
      ...current,
      assets: current.assets.map((asset) => asset.id === assetId ? { ...asset, ...patch } : asset),
    } : current);
  }

  function removeReportAsset(assetId: string) {
    setReportEditDraft((current) => current ? {
      ...current,
      assets: current.assets.filter((asset) => asset.id !== assetId),
      photos: current.photos.map((photo) => photo.assetId === assetId ? { ...photo, assetId: null } : photo),
      deletedAssetIds: current.assets.find((asset) => asset.id === assetId)?.isNew ? current.deletedAssetIds : [...current.deletedAssetIds, assetId],
    } : current);
  }

  function removeReportPhoto(photoId: string) {
    setReportEditDraft((current) => current ? {
      ...current,
      photos: current.photos.filter((photo) => photo.id !== photoId),
      deletedPhotoIds: current.photos.find((photo) => photo.id === photoId)?.isNew ? current.deletedPhotoIds : [...current.deletedPhotoIds, photoId],
    } : current);
    setReportPhotoFiles((current) => {
      const next = { ...current };
      delete next[photoId];
      return next;
    });
  }

  async function selectReportPhoto(file: File, photoId?: string) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024 || !file.size) {
      setReportFeedback({ tone: "error", message: "Choose a JPG, PNG or WebP photo up to 10 MB." });
      return;
    }
    // Upstream rotated and downscaled with sharp on the server; sharp cannot
    // run on Workers, so the browser does it before upload. This also applies
    // the EXIF orientation, which is what stops phone photos arriving sideways.
    let upload = file;
    try {
      const { default: imageCompression } = await import("browser-image-compression");
      upload = await imageCompression(file, {
        maxWidthOrHeight: 2000,
        maxSizeMB: 2,
        useWebWorker: true,
        fileType: file.type,
      });
    } catch {
      // Compression is an optimisation, never a gate: send the original.
    }
    const id = photoId ?? `new:${crypto.randomUUID()}`;
    const preview = URL.createObjectURL(upload);
    reportPhotoPreviewUrls.current.push(preview);
    setReportPhotoFiles((current) => ({ ...current, [id]: { file: upload, preview } }));
    if (!photoId) setReportEditDraft((current) => current ? {
      ...current, photos: [...current.photos, { id, isNew: true, label: "", assetId: null }],
    } : current);
    setReportFeedback(null);
  }

  function updateReportPhotoLabel(photoId: string, label: string) {
    setReportEditDraft((current) => current ? {
      ...current,
      photos: current.photos.map((photo) => photo.id === photoId ? { ...photo, label } : photo),
    } : current);
  }

  async function saveReportEdit() {
    if (!reportEditDraft || reportSaving) return;
    if (!reportEditDraft.technicianName.trim() || !reportEditDraft.clientName.trim() || !reportEditDraft.reportDate) {
      setReportFeedback({ tone: "error", message: "Technician, client and report date are required." });
      return;
    }

    setReportSaving(true);
    setReportFeedback(null);
    try {
      const form = new FormData();
      form.set("report", JSON.stringify(reportEditDraft));
      for (const [photoId, replacement] of Object.entries(reportPhotoFiles)) {
        if (reportEditDraft.photos.some((photo) => photo.id === photoId)) form.set(`photo:${photoId}`, replacement.file);
      }
      const response = await fetch(`/api/appointments/${appointmentId}/report`, {
        method: "PATCH",
        body: form,
      });
      const data = await response.json().catch(() => ({})) as { error?: string; warning?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save report.");

      await load();
      setReportEditDraft(null);
      clearReportPhotoPreviews();
      setReportPhotoFiles({});
      setReportFeedback({
        tone: data.warning ? "warning" : "success",
        message: data.warning ?? "Report saved and PDF updated.",
      });
    } catch (err) {
      setReportFeedback({
        tone: "error",
        message: err instanceof Error ? err.message : "Could not save report.",
      });
    } finally {
      setReportSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !appt) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-700 text-sm">
        <AlertCircle className="w-4 h-4 shrink-0" />
        {error || "Appointment not found."}
      </div>
    );
  }

  const attendancePhotos = appt.servicePhotos.filter((p) => p.type === "ATTENDANCE");
  const evidencePhotos = appt.servicePhotos.filter((p) => p.type === "EVIDENCE");
  const orphanEvidencePhotos = evidencePhotos.filter((p) => !p.assetId);
  const statusCfg = STATUS_CONFIG[appt.status] ?? { label: appt.status, className: "bg-gray-100 text-gray-600" };
  const workLocations = buildAppointmentWorkLocations(appt);
  const firstAssetId = workLocations[0]?.propertyGroups[0]?.assets[0]?.id ?? null;
  const hasPendingCheckInSos = !!appt.checkInSosRequestedAt && !appt.checkInSosResolvedAt && appt.checkIns.length === 0;
  const teamDisplay = appt.teams.map((team) => team.name).join(", ") || appt.technician?.name || "team";
  const sosResolverName = appt.checkInSosResolver?.name ?? "Staff";
  const isWarranty = appt.billingType === "WARRANTY";
  const chargeableTotal = Number(appt.totalPrice) || 0;
  const isFullyFoc = chargeableTotal <= 0;
  return (
    <div className="max-w-2xl mx-auto space-y-4">

      {/* ─── Urgent alert (technician-flagged) ─── */}
      {appt.urgent && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <h2 className="font-semibold text-red-800">Marked Urgent by the team</h2>
            {canManage && (
              <button onClick={handleResolveUrgent} disabled={resolvingUrgent}
                className="ml-auto inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition">
                {resolvingUrgent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Mark Resolved
              </button>
            )}
          </div>
          {appt.urgentReason && (
            <p className="mt-2 rounded-lg bg-white border border-red-100 px-3 py-2 text-sm text-gray-700">{appt.urgentReason}</p>
          )}
        </div>
      )}

      {/* ─── Overview ─── */}
      <Section title="Appointment Details" icon={Clock}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xl font-bold text-gray-900">{appt.customer.name}</p>
            <p className="text-sm text-gray-500">{appt.customer.area} · {appt.customer.phone}</p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusCfg.className}`}>
              {statusCfg.label}
            </span>
            {appt.approvedAt ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                <CheckCircle2 className="w-3.5 h-3.5" /> Closed
              </span>
            ) : appt.status === "DONE" && canApprovePayments ? (
              <button onClick={handleApproveClose} disabled={approving}
                className="inline-flex items-center gap-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition">
                {approving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Approve &amp; Close
              </button>
            ) : null}
          </div>
        </div>

        <div className="border-t pt-3 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer Details</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-400">Phone Number 1</p>
              <p className="flex items-center gap-1.5 text-sm text-gray-700">
                <Phone className="w-3.5 h-3.5 text-gray-400" />
                {appt.customer.phone}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-400">Phone Number 2 (Emergency)</p>
              <p className="flex items-center gap-1.5 text-sm text-gray-700">
                <Phone className="w-3.5 h-3.5 text-gray-400" />
                {appt.customer.phone2 || "Emergency contact not available"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-400">Email</p>
              <p className="flex items-center gap-1.5 text-sm text-gray-700">
                <Mail className="w-3.5 h-3.5 text-gray-400" />
                {appt.customer.email || "Not available"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-400">District</p>
              <p className="text-sm text-gray-700">{appt.customer.area || "Not available"}</p>
            </div>
          </div>
        </div>

        <div className="border-t pt-3 space-y-1">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Job Details</p>
          {appt.jobTitle && <p className="text-sm font-medium text-gray-700">{appt.jobTitle}</p>}
          {appt.parent && (
            <Link href={`/appointments/${appt.parent.id}`} className="inline-flex items-center gap-1 text-xs text-violet-600 hover:text-violet-800 font-medium">
              <CopyPlus className="w-3.5 h-3.5" /> Sub job of: {appt.parent.jobTitle || "appointment"}
            </Link>
          )}
          <div className="pt-1">
            <p className="text-base font-bold text-blue-700">{isFullyFoc ? "FOC" : `RM ${chargeableTotal.toFixed(2)}`}</p>
            {isWarranty && (
              <p className="text-xs font-medium text-[#151513]">
                {isFullyFoc ? "Warranty - no payment required" : "Warranty job - chargeable items included"}
              </p>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400 shrink-0" />
            {new Date(appt.date).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {" · "}{appt.time}{appt.timeFinish ? `–${appt.timeFinish}` : ""}
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-400 shrink-0" />
            {appt.branch.name}
          </div>
          {appt.teams.length > 0 && (
            <div className="flex items-start gap-2 sm:col-span-2">
              <Users className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {appt.teams.map((team) => (
                  <span key={team.id} className="text-gray-700">
                    {team.name}
                    {team.members.length > 0 && (
                      <span className="text-gray-400"> ({team.members.map((m) => m.name).join(", ")})</span>
                    )}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

      </Section>

      {/* ─── Check-in (with attendance) — placed before work locations ─── */}
      <Section title="Check-in" icon={CheckCircle2}>
        {appt.checkIns.length > 0 ? (
          <div className="space-y-3">
            {appt.checkInSosResolvedAt && (
              <div className="rounded-lg border border-green-100 bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
                {sosResolverName} approved {teamDisplay} to check in at this location.
              </div>
            )}
            <div className="flex items-center gap-2 text-green-700 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              Checked in at{" "}
              {new Date(appt.checkIns[0].checkedInAt).toLocaleString("en-MY", {
                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
              })}
            </div>
            {attendancePhotos.length > 0 && (
              <div>
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1.5">Attendance</p>
                <div className="flex flex-wrap gap-2">
                  {attendancePhotos.map((p) => (
                    <button key={p.id} onClick={() => setLightbox(normalizeUploadUrl(p.photoUrl))}>
                      <img src={normalizeUploadUrl(p.photoUrl)} alt="Attendance" className="w-20 h-20 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : hasPendingCheckInSos ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              SOS check-in requested by {appt.checkInSosRequester?.name ?? teamDisplay}.
              {appt.checkInSosAddress ? <span className="block text-xs text-red-600 mt-1">{appt.checkInSosAddress}</span> : null}
            </div>
            {canApprovePayments && (
              <button
                type="button"
                onClick={handlePushCheckIn}
                disabled={pushCheckInLoading}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:bg-red-300"
              >
                {pushCheckInLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                <span>Push Check-in</span>
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Technician has not checked in yet.</p>
        )}
      </Section>

      {/* ─── Work locations ─── */}
      <Section title="Work Locations" icon={MapPin}>
        <div className="space-y-3">
          <div className="flex justify-end">
            <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-full">
              {workLocations.length} address{workLocations.length === 1 ? "" : "es"}
            </span>
          </div>
          <div className="space-y-3">
            {workLocations.map((location, locationIndex) => {
              const wazeLink = buildWazeLink(location.address, location.lat, location.lng)
                || (locationIndex === 0 ? appt.locationWazeLink : "");

              return (
                <div key={`${location.address}-${locationIndex}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-500 mb-0.5">Location {locationIndex + 1}</p>
                      <p className="text-sm text-gray-700 leading-relaxed">{location.address}</p>
                    </div>
                  </div>
                  {wazeLink && (
                    <a href={wazeLink} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs text-cyan-600 hover:text-cyan-800 font-medium">
                      <Navigation className="w-3.5 h-3.5" /> Open in Waze
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                  {location.propertyGroups.map((group) => (
                    <div key={`${location.address}-${group.propertyType}`} className="border-l-2 border-blue-100 pl-3">
                      <p className="text-xs font-medium text-gray-400">Property Type</p>
                      <p className="text-sm font-semibold text-gray-800">{group.propertyType}</p>
                      <p className="text-xs font-medium text-gray-400 mt-2">Assets / Units</p>
                      <ul className="text-sm text-gray-600 space-y-1.5">
                        {group.assets.map((asset) => {
                          const assetEvidence = evidencePhotos.filter((p) => p.assetId === asset.id);
                          const visibleEvidence = assetEvidence.length > 0
                            ? assetEvidence
                            : asset.id === firstAssetId ? orphanEvidencePhotos : [];
                          return (
                            <li key={asset.id} className="rounded-lg bg-white border border-gray-100 p-3 space-y-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="grid flex-1 grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-sm">
                                  <p className="text-xs font-medium uppercase tracking-normal text-gray-400">Asset Type</p>
                                  <p className="font-semibold text-gray-800">{asset.acType ? `${asset.acType}: ` : ""}{asset.label}</p>

                                  <p className="text-xs font-medium uppercase tracking-normal text-gray-400">Job Category</p>
                                  <p className="text-gray-700">{asset.jobCategory?.name ?? "-"}</p>

                                  <p className="text-xs font-medium uppercase tracking-normal text-gray-400">Remark</p>
                                  <p className="text-gray-700">{asset.remarks || "-"}</p>
                                </div>
                                {asset.unitPrice != null && (
                                  <span className={`text-xs font-semibold shrink-0 ${asset.billingType === "WARRANTY" ? "text-[#151513]" : "text-blue-700"}`}>
                                    {asset.billingType === "WARRANTY" ? "FOC" : `RM ${Number(asset.unitPrice).toFixed(2)}`}
                                  </span>
                                )}
                              </div>

                              <div>
                                <p className="text-sm font-semibold text-gray-800 mb-1.5">Work Progress Photos</p>
                                {visibleEvidence.length > 0 ? (
                                  <div className="flex flex-wrap gap-2">
                                    {visibleEvidence.map((p, photoIndex) => (
                                      <div key={p.id} className="space-y-1">
                                        <p className="text-xs font-medium text-gray-500">{p.label || `Photo ${photoIndex + 1}`}</p>
                                        <button onClick={() => setLightbox(normalizeUploadUrl(p.photoUrl))}>
                                          <img src={normalizeUploadUrl(p.photoUrl)} alt={`${asset.label} evidence ${photoIndex + 1}`} className="w-16 h-16 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-xs text-gray-400">-</p>
                                )}
                              </div>

                              <div className="space-y-1.5">
                                <p className="text-xs font-medium text-gray-500">Technician Remark</p>
                                <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                                  {asset.technicianRemark || "-"}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

      </Section>

      {/* ─── Sub jobs ─── */}
      {(canManage || appt.subJobs.length > 0) && (
        <Section title="Sub Jobs" icon={CopyPlus}>
          {appt.subJobs.length > 0 ? (
            <ul className="space-y-2">
              {appt.subJobs.map((subJob) => (
                <li key={subJob.id}>
                  <Link href={`/appointments/${subJob.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 hover:bg-gray-50 transition">
                    <span className="text-sm text-gray-700">{subJob.jobTitle || "Sub job"}</span>
                    <span className="text-xs text-gray-400">
                      {new Date(subJob.date).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-400">No sub jobs yet.</p>
          )}
          {canManage && (
            <button type="button" onClick={() => setSubJobModal(true)}
              className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium px-4 py-2 rounded-xl transition">
              <CopyPlus className="w-4 h-4" /> Create Sub Job
            </button>
          )}
        </Section>
      )}

      {/* ─── Payment ─── */}
      {(appt.payments.length > 0 || isWarranty) && (
        <Section title="Payment" icon={CreditCard}>
          {actionError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="flex-1">{actionError}</span>
              <button onClick={() => setActionError("")}><X className="w-4 h-4" /></button>
            </div>
          )}

          {isWarranty && (
            <div className="rounded-lg border border-[#F2B705]/30 bg-[#F2B705]/10 px-3 py-2 text-sm text-[#151513]">
              <p className="font-semibold">
                {isFullyFoc ? "This appointment is covered under warranty. No payment is required." : "This appointment includes warranty items. Chargeable items still require payment."}
              </p>
              {appt.warrantyNote && <p className="mt-1 text-[#151513]">{appt.warrantyNote}</p>}
            </div>
          )}

          {appt.payments.map((p) => (
            <div key={p.id} className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">RM {Number(p.amount).toFixed(2)}</p>
                  <p className="text-xs text-gray-500">{METHOD_LABELS[p.method] ?? p.method}</p>
                </div>
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  p.status === "APPROVED" ? "bg-green-100 text-green-700" :
                  p.status === "REJECTED" ? "bg-red-100 text-red-700" :
                  "bg-amber-100 text-amber-700"
                }`}>
                  {p.status}
                </span>
              </div>

              {p.receiptPhotoUrl && (
                isPdfReceiptUrl(p.receiptPhotoUrl) ? (
                  <a
                    href={normalizeUploadUrl(p.receiptPhotoUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                    title="Open PDF receipt"
                  >
                    <FileText className="w-3.5 h-3.5" /> View receipt
                  </a>
                ) : (
                  <button onClick={() => setLightbox(normalizeUploadUrl(p.receiptPhotoUrl!))} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <Camera className="w-3.5 h-3.5" /> View receipt
                  </button>
                )
              )}

              {canApprovePayments && p.method === "OFFICE" && (
                <div className="space-y-2 rounded-lg border border-gray-100 bg-gray-50 p-3">
                  <p className="text-xs font-medium text-gray-500">Office payment proof</p>
                  {officeReceiptPaymentId === p.id && officeReceiptPreviewUrl ? (
                    <div className="space-y-3">
                      {officeReceiptFile?.type === "application/pdf" ? (
                        <div className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700">
                          <FileText className="h-4 w-4 text-blue-600" />
                          PDF receipt selected
                        </div>
                      ) : (
                        <img
                          src={officeReceiptPreviewUrl}
                          alt="Office payment proof preview"
                          className="h-28 w-28 rounded-lg border border-gray-200 object-cover"
                        />
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => saveOfficeReceipt(p.id)}
                          disabled={officeReceiptSaving === p.id}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#151513] px-3 py-1.5 text-xs font-medium text-white transition hover:bg-[#26251f] disabled:bg-[#151513]/60"
                        >
                          {officeReceiptSaving === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={clearOfficeReceiptDraft}
                          disabled={officeReceiptSaving === p.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                        >
                          <X className="h-3.5 w-3.5" />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50">
                      <Camera className="h-3.5 w-3.5" />
                      {p.receiptPhotoUrl ? "Re-upload Receipt" : "Upload Payment Photo"}
                      <input
                        type="file"
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={(event) => {
                          handleOfficeReceiptSelect(p.id, event.target.files?.[0]);
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              )}

              {p.status === "REJECTED" && p.rejectReason && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">Reason: {p.rejectReason}</p>
              )}

              {p.approvedBy && (
                <p className="text-xs text-gray-400">Processed by {p.approvedBy.name}</p>
              )}

              {/* Payment approval now happens via "Approve & Close" on the job
                  (top of this page or the appointment / dashboard lists). */}
              {p.status === "PENDING" && (
                <p className="text-xs text-amber-600">Pending — approved when the job is closed.</p>
              )}
            </div>
          ))}

          {!isFullyFoc && appt.payments.length === 0 && (
            <p className="text-sm text-gray-400">No payment submitted yet.</p>
          )}
        </Section>
      )}

      {/* ─── Report ─── */}
      {appt.status === "DONE" && (
        <Section title="Service Report" icon={FileText}>
          {appt.report ? (
            <div className="space-y-3">
              {reportFeedback && (
                <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  reportFeedback.tone === "success"
                    ? "border-green-200 bg-green-50 text-green-700"
                    : reportFeedback.tone === "warning"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-red-200 bg-red-50 text-red-700"
                }`}>
                  {reportFeedback.tone === "success"
                    ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span className="flex-1">{reportFeedback.message}</span>
                  <button type="button" onClick={() => setReportFeedback(null)} aria-label="Dismiss report message">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              {reportEditDraft ? (
                <form
                  className="space-y-5 rounded-xl border border-[#F2B705]/30 bg-[#F2B705]/10/40 p-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveReportEdit();
                  }}
                >
                  <div className="rounded-lg border border-[#F2B705]/30 bg-white px-3 py-2 text-xs leading-relaxed text-[#151513]">
                    Original signatures are retained. Saving these changes will generate a fresh PDF report.
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-gray-600">Technician</span>
                      <input
                        required
                        disabled={reportSaving}
                        maxLength={120}
                        value={reportEditDraft.technicianName}
                        onChange={(event) => setReportEditDraft((current) => current ? {
                          ...current,
                          technicianName: event.target.value,
                        } : current)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-[#F2B705] focus:ring-2 focus:ring-[#F2B705]/30"
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-xs font-semibold text-gray-600">Client signed</span>
                      <input
                        required
                        disabled={reportSaving}
                        maxLength={120}
                        value={reportEditDraft.clientName}
                        onChange={(event) => setReportEditDraft((current) => current ? {
                          ...current,
                          clientName: event.target.value,
                        } : current)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-[#F2B705] focus:ring-2 focus:ring-[#F2B705]/30"
                      />
                    </label>
                    <label className="space-y-1.5 sm:col-span-2">
                      <span className="text-xs font-semibold text-gray-600">Report date</span>
                      <input
                        type="date"
                        required
                        disabled={reportSaving}
                        value={reportEditDraft.reportDate}
                        onChange={(event) => setReportEditDraft((current) => current ? {
                          ...current,
                          reportDate: event.target.value,
                        } : current)}
                        className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 outline-none transition focus:border-[#F2B705] focus:ring-2 focus:ring-[#F2B705]/30"
                      />
                    </label>
                  </div>

                  <ReportAssetEditor
                    assets={reportEditDraft.assets}
                    categories={categories}
                    disabled={reportSaving}
                    onChange={updateReportAsset}
                    onRemove={removeReportAsset}
                    onAdd={() => setReportEditDraft((current) => current ? {
                      ...current, assets: [...current.assets, {
                        id: `new:${crypto.randomUUID()}`, isNew: true, label: "", acType: "",
                        jobCategoryId: "", unitPrice: "0", billingType: "CHARGEABLE",
                        remarks: "", technicianRemark: "", additionalAddress: "",
                        propertyType: appt.customer.propertyType ?? "", workLocationAddress: appt.locationAddress,
                      }],
                    } : current)}
                  />

                    <div className="space-y-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Report photos</p>
                        <p className="mt-0.5 text-xs text-gray-400">Add, remove or replace photos and edit their labels. Changes apply when you Save report. JPG, PNG or WebP, up to 10 MB per photo.</p>
                      </div>
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[#F2B705]/40 bg-white px-3 py-2 text-xs font-semibold text-[#151513]">
                        <Camera className="h-4 w-4" /> Add photos
                        <input type="file" multiple accept="image/jpeg,image/png,image/webp" aria-label="Add report photos" disabled={reportSaving} className="sr-only" onChange={(event) => {
                          const files = Array.from(event.target.files ?? []);
                          event.target.value = "";
                          files.forEach((file) => selectReportPhoto(file));
                        }} />
                      </label>
                      {!reportEditDraft.photos.length && <p className="text-sm text-gray-500">No report photos.</p>}
                      <div className="grid gap-3 sm:grid-cols-2">
                        {reportEditDraft.photos.map((draftPhoto, index) => {
                          const photo = appt.servicePhotos.find((item) => item.id === draftPhoto.id);
                          return (
                            <div key={draftPhoto.id} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-2.5">
                              {(photo || reportPhotoFiles[draftPhoto.id]) && (
                                <img
                                  src={reportPhotoFiles[draftPhoto.id]?.preview ?? normalizeUploadUrl(photo!.photoUrl)}
                                  alt="Evidence preview"
                                  className="h-20 w-20 shrink-0 rounded-lg border border-gray-200 object-cover"
                                />
                              )}
                              <span className="min-w-0 flex-1 space-y-1">
                                <span className="block text-[11px] font-medium text-gray-500">Photo {index + 1}</span>
                                <select
                                  aria-label={`Photo ${index + 1} asset`}
                                  disabled={reportSaving}
                                  value={draftPhoto.assetId ?? ""}
                                  onChange={(event) => setReportEditDraft((current) => current ? {
                                    ...current, photos: current.photos.map((item) => item.id === draftPhoto.id ? { ...item, assetId: event.target.value || null } : item),
                                  } : current)}
                                  className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs"
                                >
                                  <option value="">General report photo</option>
                                  {reportEditDraft.assets.map((asset, assetIndex) => <option key={asset.id} value={asset.id}>Asset {assetIndex + 1}: {asset.label || asset.acType || "Asset"}</option>)}
                                </select>
                                <input
                                  aria-label={`Photo ${index + 1} name`}
                                  disabled={reportSaving}
                                  maxLength={160}
                                  value={draftPhoto.label}
                                  onChange={(event) => updateReportPhotoLabel(draftPhoto.id, event.target.value)}
                                  placeholder={`Photo ${index + 1}`}
                                  className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-800 outline-none transition focus:border-[#F2B705] focus:ring-2 focus:ring-[#F2B705]/30"
                                />
                                <label className={`inline-flex items-center gap-1.5 rounded-md border border-[#F2B705]/40 px-2.5 py-1.5 text-xs font-semibold text-[#151513] ${reportSaving ? "opacity-50" : "cursor-pointer hover:bg-[#F2B705]/10"}`}>
                                  <Camera className="h-3.5 w-3.5" /> Replace photo
                                  <input
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="sr-only"
                                    aria-label={`Replace photo ${index + 1}`}
                                    disabled={reportSaving}
                                    onChange={(event) => {
                                      const file = event.target.files?.[0];
                                      event.target.value = "";
                                      if (!file) return;
                                      selectReportPhoto(file, draftPhoto.id);
                                    }}
                                  />
                                </label>
                                <button type="button" disabled={reportSaving} onClick={() => removeReportPhoto(draftPhoto.id)} className="ml-2 text-xs font-semibold text-red-600">Remove photo</button>
                                {reportPhotoFiles[draftPhoto.id] && <span className="block text-xs text-[#151513]">New photo selected — save report to upload.</span>}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  <div className="flex flex-wrap justify-end gap-2 border-t border-[#F2B705]/30 pt-4">
                    {(reportEditDraft.deletedAssetIds.length > 0 || reportEditDraft.deletedPhotoIds.length > 0) && (
                      <p className="w-full text-xs text-red-700">Will remove {reportEditDraft.deletedAssetIds.length} asset(s) and {reportEditDraft.deletedPhotoIds.length} photo(s) when saved. Cancel discards these changes.</p>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setReportEditDraft(null);
                        clearReportPhotoPreviews();
                        setReportPhotoFiles({});
                        setReportFeedback(null);
                      }}
                      disabled={reportSaving}
                      className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-60"
                    >
                      <X className="h-4 w-4" />
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={reportSaving}
                      className="inline-flex items-center gap-2 rounded-lg bg-[#151513] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#26251f] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {reportSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {reportSaving ? "Saving & updating PDF" : "Save report"}
                    </button>
                  </div>
                </form>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid flex-1 grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs text-gray-400">Technician</p>
                        <p className="font-medium text-gray-800">{appt.report.technicianName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Client signed</p>
                        <p className="font-medium text-gray-800">{appt.report.clientName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">Report date</p>
                        <p className="font-medium text-gray-800">
                          {new Date(appt.report.reportDate).toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      </div>
                    </div>
                    {canEditReport && (
                      <button
                        type="button"
                        onClick={beginReportEdit}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#F2B705]/40 bg-[#F2B705]/10 px-3 py-2 text-xs font-semibold text-[#151513] transition hover:border-[#F2B705]/60 hover:bg-[#F2B705]/20"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit report
                      </button>
                    )}
                  </div>

                  {appt.report.pdfUrl && (
                    <button
                      type="button"
                      onClick={() => handleOpenReportPdf(appt.report!.pdfUrl!)}
                      disabled={pdfOpenPending}
                      className="inline-flex items-center gap-2 bg-[#151513] hover:bg-[#26251f] disabled:bg-[#151513]/50 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
                    >
                      {pdfOpenPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                      {pdfOpenPending ? "Preparing PDF" : "Download PDF Report"}
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-400">Report not yet submitted.</p>
          )}
        </Section>
      )}

      {/* Photo lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            aria-label="Close image viewer"
            onClick={() => setLightbox(null)}
            className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-gray-700 shadow-lg transition hover:bg-white"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={lightbox}
            alt="Full view"
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {pdfViewer && (
        <div className="fixed inset-0 z-50 flex h-[100dvh] flex-col bg-gray-900">
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-gray-200 bg-white px-3 py-2 shadow-sm">
            <button
              type="button"
              onClick={() => setPdfViewer(null)}
              className="inline-flex h-10 items-center gap-2 rounded-lg px-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            >
              <X className="h-5 w-5" />
              Close
            </button>
            <button
              type="button"
              onClick={handlePdfDownload}
              disabled={pdfDownloadPending}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gray-100 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {pdfDownloadPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              {pdfDownloadPending ? "Preparing PDF" : "Download"}
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-gray-200">
            <div
              className="min-h-full"
              style={compactPdfViewer ? { width: "138.8889%", transform: "scale(0.72)", transformOrigin: "top left" } : undefined}
            >
              <iframe
                title="PDF Report"
                src={`${pdfViewer}#toolbar=0&navpanes=0&zoom=page-width&view=FitH`}
                className="min-h-0 w-full bg-gray-200"
                style={{ height: "calc(100dvh - 57px)" }}
              />
            </div>
          </div>
        </div>
      )}

      {canManage && (
        <AppointmentModal
          open={subJobModal}
          onClose={() => { setSubJobModal(false); void load(); }}
          categories={categories}
          customers={customers}
          teams={teams}
          preselectedCustomerId={appt.customerId}
          parentId={appt.id}
        />
      )}
    </div>
  );
}
