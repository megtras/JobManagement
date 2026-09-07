"use client";
import {
  useState, useRef, useEffect, useCallback,
} from "react";
import {
  MapPin, Clock, Navigation, Camera, CheckCircle2, Loader2,
  WifiOff, AlertCircle, AlertTriangle, CreditCard, Trash2, Users,
  ExternalLink, MessageCircle, Download, Check, X, Phone, Mail, LogOut, Cloud,
} from "lucide-react";
import SignaturePad from "signature_pad";
import {
  cacheTask,
  getCachedTask,
  getPendingQueueForTask,
  removeQueuedEntity,
  updateCachedTaskListItem,
} from "@/lib/offline/idb";
import {
  OFFLINE_SYNC_COMPLETED_EVENT,
  offlineEntityId,
  submitOfflineRequest,
} from "@/lib/offline/client";
import { normalizeUploadUrl } from "@/lib/upload-urls";
import { buildWazeLink } from "@/lib/waze";
import { isTroubleshootCategoryName } from "@/lib/appointment-pricing";

const EXTERNAL_WHATSAPP_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_EXTERNAL_WHATSAPP === "true";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Asset {
  id: string;
  label: string;
  acType?: string | null;
  remarks?: string | null;
  technicianRemark?: string | null;
  unitPrice?: string | number | null;
  billingType?: "CHARGEABLE" | "WARRANTY" | null;
  isTroubleshoot?: boolean | null;
  jobCategory?: { id?: string; name: string; price?: string | number | null; minEvidencePhotos?: number | null } | null;
  additionalAddress?: string | null;
  propertyType?: string | null;
  workLocationAddress?: string | null;
  workLocationLat?: number | null;
  workLocationLng?: number | null;
}
interface ServicePhoto { id: string; photoUrl: string; type: string; assetId?: string | null; label?: string | null; createdAt: string }
interface Payment { id: string; method: string; status: string; receiptPhotoUrl?: string | null }
interface CheckInRecord { checkedInAt: string; lat: number; lng: number }
interface Report { id: string; pdfUrl?: string | null; technicianSignature?: string | null; clientSignature?: string | null }
interface PreviousAppointment {
  id: string;
  jobNo?: number;
  date: string;
  time: string;
  timeFinish?: string | null;
  status: string;
  totalPrice: string;
  billingType: "CHARGEABLE" | "WARRANTY";
  warrantyNote?: string | null;
  jobTitle: string;
  locationAddress: string;
  locationLat: number | null;
  locationLng: number | null;
  locationWazeLink: string;
  customer: { name: string; phone: string; phone2?: string | null; email?: string | null; area: string };
  jobCategory: { name: string; price: string } | null;
  teams?: { id: string; name: string; members: { name: string }[] }[];
  assets: Asset[];
  servicePhotos: ServicePhoto[];
}

export interface Task {
  id: string;
  jobNo?: number;
  date: string;
  time: string;
  timeFinish?: string | null;
  clockOutAt?: string | null;
  status: string;
  urgent?: boolean | null;
  billingType: "CHARGEABLE" | "WARRANTY";
  warrantyNote?: string | null;
  urgentReason?: string | null;
  checkInSosRequestedAt?: string | null;
  checkInSosAddress?: string | null;
  checkInSosLat?: number | null;
  checkInSosLng?: number | null;
  checkInSosResolvedAt?: string | null;
  checkInSosResolvedById?: string | null;
  checkInSosResolver?: { id: string; name: string } | null;
  locationAddress: string;
  locationLat: number;
  locationLng: number;
  locationWazeLink: string;
  totalPrice: string;
  jobTitle: string;
  customer: { name: string; phone: string; phone2?: string | null; email?: string | null; area: string };
  jobCategory: { name: string; price: string } | null;
  jobCategories?: { id: string; name: string; price: string; minEvidencePhotos?: number | null }[];
  branch: { name: string };
  technician?: { name: string } | null;
  teams?: { id: string; name: string; members: { name: string }[] }[];
  assets: Asset[];
  checkIns: CheckInRecord[];
  servicePhotos: ServicePhoto[];
  payments: Payment[];
  report: Report | null;
  previousAppointment?: PreviousAppointment | null;
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fitCanvas(canvas: HTMLCanvasElement, pad: SignaturePad) {
  if (canvas.offsetWidth === 0) return; // not visible yet — a ResizeObserver will re-fit
  const ratio = Math.max(window.devicePixelRatio || 1, 1);
  // Resizing the canvas bitmap clears it, so preserve and redraw any existing strokes.
  const data = pad.toData();
  canvas.width = canvas.offsetWidth * ratio;
  canvas.height = canvas.offsetHeight * ratio;
  canvas.getContext("2d")?.scale(ratio, ratio);
  pad.fromData(data);
}

// Derive stepper position purely from server data — no local step state needed
function evidenceRequirementForAsset(asset: Pick<Asset, "jobCategory">, fallback: number) {
  return Math.max(3, Number(asset.jobCategory?.minEvidencePhotos ?? fallback));
}

function deriveStep(task: Task, minPhotos: number): number {
  if (task.clockOutAt) return 5;
  // Payment approval is now a manager close-step, so any recorded payment
  // unlocks the signature step for the technician.
  if (task.payments.length > 0) return 4;
  if (task.status === "COMING_SOON") return 0;
  const evidence = task.servicePhotos.filter((p) => p.type === "EVIDENCE");
  const attendance = task.servicePhotos.filter((p) => p.type === "ATTENDANCE");
  const hasRequiredEvidence = task.assets.length > 0
    ? task.assets.every((asset) => evidence.filter((p) => p.assetId === asset.id).length >= evidenceRequirementForAsset(asset, minPhotos))
    : evidence.length >= minPhotos;
  if (Number(task.totalPrice) <= 0 && hasRequiredEvidence && attendance.length > 0) return 4;
  if (hasRequiredEvidence && attendance.length > 0) return 3;
  if (task.checkIns.length > 0) return 2;
  return 1;
}

function cleanText(value?: string | null) {
  return value?.trim() ?? "";
}

function buildAssetRemarkDrafts(assets: Asset[]) {
  return Object.fromEntries(assets.map((asset) => [asset.id, asset.technicianRemark ?? ""]));
}

function mergeAssetRemarkDrafts(
  serverDrafts: Record<string, string>,
  currentDrafts: Record<string, string>,
  dirtyAssetIds: ReadonlySet<string>,
  queuedDrafts: Record<string, string>,
) {
  const merged = { ...serverDrafts };
  for (const assetId of Object.keys(serverDrafts)) {
    if (dirtyAssetIds.has(assetId) && currentDrafts[assetId] !== undefined) {
      merged[assetId] = currentDrafts[assetId];
    } else if (queuedDrafts[assetId] !== undefined) {
      merged[assetId] = queuedDrafts[assetId];
    }
  }
  return merged;
}

function sortServicePhotos(photos: ServicePhoto[]) {
  return [...photos].sort((a, b) => {
    const createdDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return createdDiff || a.id.localeCompare(b.id);
  });
}

function sortTaskAssetsForDisplay(assets: Asset[]) {
  return [...assets].sort((a, b) => {
    const troubleshootDiff =
      Number(Boolean(b.isTroubleshoot || isTroubleshootCategoryName(b.jobCategory?.name))) -
      Number(Boolean(a.isTroubleshoot || isTroubleshootCategoryName(a.jobCategory?.name)));
    return troubleshootDiff;
  });
}

function fileToDataUrl(file: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Could not read photo"));
    reader.readAsDataURL(file);
  });
}

function distanceInMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const radius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function geolocationErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message;

  if (err && typeof err === "object" && "code" in err) {
    const code = Number((err as { code?: unknown }).code);
    switch (code) {
      case 1:
        return "Location permission is blocked. Please allow location access for this app and try again.";
      case 2:
        return "Could not detect your GPS location. Please turn on device location and try again outside/near a window.";
      case 3:
        return "GPS took too long to respond. Please try again after the location icon stabilizes.";
      default:
        return "Could not get your current location. Please check device GPS and try again.";
    }
  }

  return "Could not get your current location. Please check device GPS and try again.";
}

function geolocationErrorCode(err: unknown) {
  return err && typeof err === "object" && "code" in err
    ? Number((err as { code?: unknown }).code)
    : null;
}

function isPermissionDenied(err: unknown) {
  return geolocationErrorCode(err) === 1;
}

function getBrowserPosition(options: PositionOptions) {
  return new Promise<GeolocationPosition>((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, options)
  );
}

async function getCheckInPosition() {
  let lastError: unknown;
  for (const options of CHECK_IN_GPS_OPTIONS) {
    try {
      return await getBrowserPosition(options);
    } catch (err) {
      lastError = err;
      if (isPermissionDenied(err)) throw err;
    }
  }

  throw lastError ?? new Error("Could not get your current location. Please check device GPS and try again.");
}

export function buildTaskWorkLocations(task: Task): WorkLocationGroup[] {
  const fallbackAddress = cleanText(task.locationAddress) || "No address recorded";
  const locationMap = new Map<string, WorkLocationGroup>();

  const ensureLocation = (address: string, lat: number | null, lng: number | null) => {
    if (!locationMap.has(address)) {
      locationMap.set(address, {
        address,
        lat,
        lng,
        propertyGroups: [],
      });
    }

    const location = locationMap.get(address)!;
    if (location.lat == null && lat != null) location.lat = lat;
    if (location.lng == null && lng != null) location.lng = lng;
    return location;
  };

  for (const asset of sortTaskAssetsForDisplay(task.assets)) {
    const address = cleanText(asset.workLocationAddress)
      || cleanText(asset.additionalAddress)
      || fallbackAddress;
    const location = ensureLocation(
      address,
      asset.workLocationLat ?? (address === fallbackAddress ? task.locationLat : null),
      asset.workLocationLng ?? (address === fallbackAddress ? task.locationLng : null)
    );
    const propertyType = cleanText(asset.propertyType) || "Property";
    let propertyGroup = location.propertyGroups.find((group) => group.propertyType === propertyType);
    if (!propertyGroup) {
      propertyGroup = { propertyType, assets: [] };
      location.propertyGroups.push(propertyGroup);
    }
    propertyGroup.assets.push(asset);
  }

  if (locationMap.size === 0) {
    ensureLocation(fallbackAddress, task.locationLat, task.locationLng);
  }

  return Array.from(locationMap.values());
}

// ─── Stepper ─────────────────────────────────────────────────────────────────

const STEP_LABELS = ["Overview", "Check-in", "Photos", "Payment", "Sign", "Done"];
const TASK_DETAIL_LIVE_POLL_MS = 3 * 1000;
const CHECK_IN_GPS_OPTIONS: PositionOptions[] = [
  { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 },
  { enableHighAccuracy: false, timeout: 25000, maximumAge: 60000 },
];

function Stepper({ current }: { current: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
      <div className="flex items-center justify-between">
        {STEP_LABELS.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={label} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                    ${done ? "bg-green-500 text-white" : active ? "bg-[#151513] text-white" : "bg-gray-200 text-gray-400"}`}
                >
                  {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={`text-[10px] mt-1 hidden sm:block ${active ? "text-blue-600 font-medium" : "text-gray-400"}`}>
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 && (
                <div className={`h-0.5 w-4 mx-0.5 mb-3.5 sm:mb-0 ${i < current ? "bg-green-500" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PhotoThumbnail({
  photo,
  alt,
  onDelete,
  onEdit,
  deleting,
  canDelete,
  canEdit,
}: {
  photo: ServicePhoto;
  alt: string;
  onDelete: (photoId: string) => void;
  onEdit?: (photo: ServicePhoto) => void;
  deleting: boolean;
  canDelete: boolean;
  canEdit?: boolean;
}) {
  const image = (
    <img
      src={normalizeUploadUrl(photo.photoUrl)}
      alt={alt}
      className="w-20 h-20 object-cover rounded-lg border border-gray-200"
    />
  );

  return (
    <div className="relative w-20 h-20">
      {canEdit && onEdit ? (
        <button
          type="button"
          onClick={() => onEdit(photo)}
          aria-label={`Edit ${alt}`}
          className="block rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {image}
        </button>
      ) : image}
      {canDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(photo.id);
          }}
          disabled={deleting}
          aria-label={`Delete ${alt}`}
          className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:bg-red-300"
        >
          {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TaskDetailClient({
  taskId,
  minEvidencePhotos,
  geofenceRadius = 200,
}: {
  taskId: string;
  minEvidencePhotos: number;
  geofenceRadius?: number;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(true);
  const [error, setError] = useState("");
  const [offlineNotice, setOfflineNotice] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [previousPreviewOpen, setPreviousPreviewOpen] = useState(false);
  const latestLoadRequestRef = useRef(0);
  const liveRefreshInFlightRef = useRef(false);

  // Urgent flag
  const [urgentReason, setUrgentReason] = useState("");
  const [urgentLoading, setUrgentLoading] = useState(false);
  const [urgentOpen, setUrgentOpen] = useState(false);
  const [urgentError, setUrgentError] = useState("");

  // Start
  const [startLoading, setStartLoading] = useState(false);

  // Check-in
  const [gpsLoadingKey, setGpsLoadingKey] = useState("");
  const [gpsErrorKey, setGpsErrorKey] = useState("");
  const [gpsError, setGpsError] = useState("");
  const [sosLoadingKey, setSosLoadingKey] = useState("");
  const [sosErrorKey, setSosErrorKey] = useState("");
  const [sosError, setSosError] = useState("");

  // Photos
  const attendanceVideoRef = useRef<HTMLVideoElement>(null);
  const attendanceStreamRef = useRef<MediaStream | null>(null);
  const pendingPhoto = useRef<{ type: "ATTENDANCE" | "EVIDENCE" | "RECEIPT"; assetId?: string; photoId?: string } | null>(null);
  const pendingAttendanceLocation = useRef<WorkLocationGroup | null>(null);
  const assetPhotoSectionRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const photoCaptureInFlightRef = useRef(false);
  const photoUploadInFlightRef = useRef(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState("");
  const [editingPhoto, setEditingPhoto] = useState<ServicePhoto | null>(null);
  const [editingPhotoLabel, setEditingPhotoLabel] = useState("");
  const [editPhotoSaving, setEditPhotoSaving] = useState(false);
  const [assetRemarks, setAssetRemarks] = useState<Record<string, string>>({});
  const assetRemarksRef = useRef<Record<string, string>>({});
  const dirtyAssetRemarkIdsRef = useRef<Set<string>>(new Set());
  const queuedAssetRemarkDraftsRef = useRef<Record<string, string>>({});
  const assetRemarkSaveChainsRef = useRef<Map<string, Promise<void>>>(new Map());
  const [photoLabel, setPhotoLabel] = useState("");
  const [nextLoading, setNextLoading] = useState(false);
  const [attendanceCameraOpen, setAttendanceCameraOpen] = useState(false);
  const [attendanceCameraError, setAttendanceCameraError] = useState("");
  const [livePhotoType, setLivePhotoType] = useState<"ATTENDANCE" | "EVIDENCE" | "RECEIPT">("ATTENDANCE");
  const taskRootRef = useRef<HTMLDivElement>(null);

  // Payment
  const [payMethod, setPayMethod] = useState<"CASH" | "QR_TRANSFER" | "OFFICE">("CASH");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState("");
  // Object URL ref — revoked whenever the file changes or on unmount
  const receiptUrlRef = useRef<string | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [showPaymentStep, setShowPaymentStep] = useState(false);
  const [continueRepairOpen, setContinueRepairOpen] = useState(false);
  const [newWorkCategoryId, setNewWorkCategoryId] = useState("");
  const [newWorkBillingType, setNewWorkBillingType] = useState<"CHARGEABLE" | "WARRANTY">("CHARGEABLE");
  const [addingWorkItem, setAddingWorkItem] = useState(false);
  const repairPickerRef = useRef<HTMLDivElement>(null);
  const repairDecisionBoundaryRef = useRef<HTMLDivElement>(null);

  // Signatures
  const techCanvasRef = useRef<HTMLCanvasElement>(null);
  const clientCanvasRef = useRef<HTMLCanvasElement>(null);
  // After a report exists its signatures are shown read-only; "Re-sign" reopens a pad.
  const [resignTech, setResignTech] = useState(false);
  const [resignClient, setResignClient] = useState(false);
  const techPad = useRef<SignaturePad | null>(null);
  const clientPad = useRef<SignaturePad | null>(null);
  const techPadCanvas = useRef<HTMLCanvasElement | null>(null);
  const clientPadCanvas = useRef<HTMLCanvasElement | null>(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const paymentStepRef = useRef<HTMLDivElement>(null);

  // Done result
  const [doneResult, setDoneResult] = useState<{ pdfUrl: string; whatsappLink: string } | null>(null);
  const [pdfViewer, setPdfViewer] = useState<{ url: string; viewUrl: string; whatsappLink: string } | null>(null);
  const [pdfDownloadPending, setPdfDownloadPending] = useState(false);
  const [pdfOpenPending, setPdfOpenPending] = useState(false);
  const [compactPdfViewer, setCompactPdfViewer] = useState(false);

  // Revoke object URL on unmount to avoid memory leak
  useEffect(() => {
    return () => {
      if (receiptUrlRef.current) URL.revokeObjectURL(receiptUrlRef.current);
      attendanceStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    function updatePdfViewerMode() {
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches
        || window.matchMedia("(display-mode: fullscreen)").matches
        || Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
      setCompactPdfViewer(isStandalone || window.innerWidth < 768);
    }

    updatePdfViewerMode();
    window.addEventListener("resize", updatePdfViewerMode);
    return () => window.removeEventListener("resize", updatePdfViewerMode);
  }, []);

  // ─── Receipt file helper (creates + tracks object URL) ───────────────────────

  const applyReceiptFile = (file: File | null) => {
    if (receiptUrlRef.current) {
      URL.revokeObjectURL(receiptUrlRef.current);
      receiptUrlRef.current = null;
    }
    setReceiptFile(file);
    if (file) {
      receiptUrlRef.current = URL.createObjectURL(file);
      setReceiptPreviewUrl(receiptUrlRef.current);
    } else {
      setReceiptPreviewUrl("");
    }
  };

  // ─── Load task ──────────────────────────────────────────────────────────────

  const refreshQueuedRemarkDrafts = useCallback(async () => {
    const queue = await getPendingQueueForTask(taskId);
    const queuedDrafts: Record<string, string> = {};
    for (const item of queue) {
      if (item.action !== "remark" || item.body.kind !== "json") continue;
      try {
        const body = JSON.parse(item.body.value) as { assetId?: unknown; technicianRemark?: unknown };
        if (typeof body.assetId === "string" && typeof body.technicianRemark === "string") {
          queuedDrafts[body.assetId] = body.technicianRemark.trim();
        }
      } catch {
        // Leave malformed legacy queue entries to the normal offline retry UI.
      }
    }
    queuedAssetRemarkDraftsRef.current = queuedDrafts;
  }, [taskId]);

  const loadTask = useCallback(async (silent = false) => {
    const requestId = ++latestLoadRequestRef.current;
    if (!silent) setLoading(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { cache: "no-store" });
      if (!res.ok) throw new Error("fetch failed");
      const data: Task = await res.json();
      if (requestId !== latestLoadRequestRef.current) return;
      setTask(data);
      setAssetRemarks((current) => {
        const merged = mergeAssetRemarkDrafts(
          buildAssetRemarkDrafts(data.assets),
          current,
          dirtyAssetRemarkIdsRef.current,
          queuedAssetRemarkDraftsRef.current,
        );
        assetRemarksRef.current = merged;
        return merged;
      });
      await cacheTask(taskId, data);
    } catch {
      if (requestId !== latestLoadRequestRef.current) return;
      const cached = await getCachedTask(taskId) as Task | null;
      if (cached) {
        setTask(cached);
        setAssetRemarks((current) => {
          const merged = mergeAssetRemarkDrafts(
            buildAssetRemarkDrafts(cached.assets),
            current,
            dirtyAssetRemarkIdsRef.current,
            queuedAssetRemarkDraftsRef.current,
          );
          assetRemarksRef.current = merged;
          return merged;
        });
      } else {
        setError("Could not load task. Please check your connection.");
      }
    } finally {
      if (requestId === latestLoadRequestRef.current) setLoading(false);
    }
  }, [taskId]);

  const updateLocalTask = useCallback((update: (current: Task) => Task) => {
    setTask((current) => {
      if (!current) return current;
      const next = update(current);
      void cacheTask(taskId, next);
      void updateCachedTaskListItem(taskId, {
        status: next.status,
        clockOutAt: next.clockOutAt ?? null,
        totalPrice: next.totalPrice,
        urgent: next.urgent ?? false,
        checkInCount: next.checkIns.length,
        photoCount: next.servicePhotos.length,
      });
      return next;
    });
  }, [taskId]);

  const showQueuedNotice = useCallback((label: string) => {
    setOfflineNotice(`${label} saved on this device. It will sync automatically when internet returns.`);
  }, []);

  function scrollAssetPhotosIntoView(assetId?: string) {
    if (!assetId || typeof window === "undefined" || window.innerWidth >= 768) return;
    requestAnimationFrame(() => {
      assetPhotoSectionRefs.current[assetId]?.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "nearest",
      });
    });
  }

  function clampRepairSelectionScroll() {
    if (typeof window === "undefined" || window.innerWidth >= 768) return;
    const scrollContainer = taskRootRef.current?.closest("main") as HTMLElement | null;
    const boundary = repairPickerRef.current ?? repairDecisionBoundaryRef.current;
    if (!scrollContainer || !boundary) return;

    const containerRect = scrollContainer.getBoundingClientRect();
    const boundaryRect = boundary.getBoundingClientRect();
    const boundaryBottom = scrollContainer.scrollTop + boundaryRect.bottom - containerRect.top;
    const maxScroll = Math.max(0, boundaryBottom - scrollContainer.clientHeight + 16);
    if (scrollContainer.scrollTop > maxScroll) scrollContainer.scrollTop = maxScroll;
  }

  // ─── Offline queue replay ────────────────────────────────────────────────────

  useEffect(() => {
    dirtyAssetRemarkIdsRef.current.clear();
    assetRemarksRef.current = {};
    queuedAssetRemarkDraftsRef.current = {};
    assetRemarkSaveChainsRef.current.clear();
    void (async () => {
      try {
        await refreshQueuedRemarkDrafts();
      } catch {
        queuedAssetRemarkDraftsRef.current = {};
      }
      await loadTask();
    })();

    const onOnline = () => { setIsOnline(true); void loadTask(true); };
    const onOffline = () => setIsOnline(false);
    const onSyncCompleted = (event: Event) => {
      const taskIds = (event as CustomEvent<{ taskIds?: string[] }>).detail?.taskIds ?? [];
      if (taskIds.includes(taskId)) {
        void (async () => {
          try {
            await refreshQueuedRemarkDrafts();
          } catch {
            // Keep the current queued drafts until IndexedDB is available again.
          }
          await loadTask(true);
        })();
      }
    };
    const onlineStatusTimer = window.setTimeout(() => setIsOnline(navigator.onLine), 0);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(OFFLINE_SYNC_COMPLETED_EVENT, onSyncCompleted);
    return () => {
      window.clearTimeout(onlineStatusTimer);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(OFFLINE_SYNC_COMPLETED_EVENT, onSyncCompleted);
    };
  }, [loadTask, refreshQueuedRemarkDrafts, taskId]);

  // ─── Init signature pads when payment is recorded ───────────────────────────
  // Depends on actual server data, not local step state

  const taskChargeableTotalForEffects = Number(task?.totalPrice ?? 0) || 0;
  const focSignatureReady =
    !!task &&
    taskChargeableTotalForEffects <= 0 &&
    deriveStep(task, Math.max(3, minEvidencePhotos)) >= 4;
  const paymentRecorded = (task?.payments.length ?? 0) > 0 || focSignatureReady;
  const isCheckedOutForPads = !!task?.clockOutAt;
  const paymentStepScrollVisible = !!task && taskChargeableTotalForEffects > 0 && (!!task.payments[0] || showPaymentStep) && !task.clockOutAt;
  const signaturePadsVisible = !!task && !task.clockOutAt && paymentRecorded;
  const liveTaskFinished = !!task?.clockOutAt;

  useEffect(() => {
    if (liveTaskFinished) return;

    const refreshWhenVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!navigator.onLine) return;
      if (liveRefreshInFlightRef.current) return;
      liveRefreshInFlightRef.current = true;
      void loadTask(true).finally(() => {
        liveRefreshInFlightRef.current = false;
      });
    };

    const interval = window.setInterval(refreshWhenVisible, TASK_DETAIL_LIVE_POLL_MS);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [liveTaskFinished, loadTask]);

  // Once the report is submitted, its signatures are shown read-only (so they
  // "remain"); an empty editable pad is only shown when there's nothing saved
  // yet, or when the user taps "Re-sign" to replace it.
  const savedTechSig = task?.report?.technicianSignature ?? "";
  const savedClientSig = task?.report?.clientSignature ?? "";
  const showTechPad = !savedTechSig || resignTech;
  const showClientPad = !savedClientSig || resignClient;

  useEffect(() => {
    if (!signaturePadsVisible || isCheckedOutForPads) return;

    const refit = () => {
      if (techCanvasRef.current && techPad.current) fitCanvas(techCanvasRef.current, techPad.current);
      if (clientCanvasRef.current && clientPad.current) fitCanvas(clientCanvasRef.current, clientPad.current);
    };

    const id = requestAnimationFrame(() => {
      const techCanvas = techCanvasRef.current;
      if (showTechPad && techCanvas) {
        if (techPad.current && techPadCanvas.current !== techCanvas) {
          techPad.current.off();
          techPad.current = null;
          techPadCanvas.current = null;
        }
        if (!techPad.current) {
          techPad.current = new SignaturePad(techCanvas, { backgroundColor: "rgb(255,255,255)" });
          techPadCanvas.current = techCanvas;
          fitCanvas(techCanvas, techPad.current);
        }
      }
      const clientCanvas = clientCanvasRef.current;
      if (showClientPad && clientCanvas) {
        if (clientPad.current && clientPadCanvas.current !== clientCanvas) {
          clientPad.current.off();
          clientPad.current = null;
          clientPadCanvas.current = null;
        }
        if (!clientPad.current) {
          clientPad.current = new SignaturePad(clientCanvas, { backgroundColor: "rgb(255,255,255)" });
          clientPadCanvas.current = clientCanvas;
          fitCanvas(clientCanvas, clientPad.current);
        }
      }
    });

    // On mobile the layout settles after init (images load, address bar, rotation),
    // changing the canvas size. Re-fit so touch points keep matching the bitmap.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(refit) : null;
    if (techCanvasRef.current) ro?.observe(techCanvasRef.current);
    if (clientCanvasRef.current) ro?.observe(clientCanvasRef.current);
    window.addEventListener("orientationchange", refit);

    return () => {
      cancelAnimationFrame(id);
      ro?.disconnect();
      window.removeEventListener("orientationchange", refit);
    };
  }, [signaturePadsVisible, isCheckedOutForPads, showTechPad, showClientPad]);

  useEffect(() => {
    if (!paymentStepScrollVisible) return;

    const frame = requestAnimationFrame(() => {
      paymentStepRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => cancelAnimationFrame(frame);
  }, [paymentStepScrollVisible]);

  useEffect(() => {
    if (!continueRepairOpen) return;

    const frame = window.requestAnimationFrame(() => {
      repairPickerRef.current?.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "nearest",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [continueRepairOpen]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const scrollContainer = taskRootRef.current?.closest("main") as HTMLElement | null;
    if (!scrollContainer) return;

    let frame = 0;
    const scheduleClamp = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(clampRepairSelectionScroll);
    };

    scheduleClamp();
    scrollContainer.addEventListener("scroll", scheduleClamp, { passive: true });
    window.addEventListener("resize", scheduleClamp);
    return () => {
      window.cancelAnimationFrame(frame);
      scrollContainer.removeEventListener("scroll", scheduleClamp);
      window.removeEventListener("resize", scheduleClamp);
    };
  }, [
    continueRepairOpen,
    newWorkBillingType,
    newWorkCategoryId,
    showPaymentStep,
    task?.assets.length,
    task?.id,
    task?.payments.length,
    task?.servicePhotos.length,
  ]);

  // Drop a pad when its canvas is hidden (saved image shown) so re-opening it
  // later creates a fresh pad bound to the new canvas.
  useEffect(() => { if (!showTechPad) { techPad.current?.off(); techPad.current = null; } }, [showTechPad]);
  useEffect(() => { if (!showClientPad) { clientPad.current?.off(); clientPad.current = null; } }, [showClientPad]);

  // ─── Start / Check-in ───────────────────────────────────────────────────────

  const handleStartTask = async () => {
    setStartLoading(true);
    setError("");
    setOfflineNotice("");
    try {
      const occurredAt = new Date().toISOString();
      const result = await submitOfflineRequest({
        taskId,
        action: "start",
        label: "Start task",
        url: `/api/tasks/${taskId}/start`,
        json: { occurredAt },
      });
      if (result.queued) {
        updateLocalTask((current) => ({ ...current, status: "IN_PROGRESS" }));
        showQueuedNotice("Start task");
      } else {
        const data = await result.response.json().catch(() => ({})) as { error?: string };
        if (!result.response.ok) throw new Error(data.error ?? "Start task failed");
        await loadTask(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Start task failed");
    } finally {
      setStartLoading(false);
    }
  };

  const handleCheckIn = async (location: WorkLocationGroup, locIdx: number) => {
    const locationId = locationKey(location, locIdx);
    setGpsLoadingKey(locationId);
    setGpsErrorKey(locationId);
    setGpsError("");
    try {
      const targetLat = location.lat ?? task?.locationLat ?? null;
      const targetLng = location.lng ?? task?.locationLng ?? null;
      if (typeof targetLat !== "number" || typeof targetLng !== "number") {
        throw new Error("This work location has no GPS pin. Please edit the appointment location and save the map pin again.");
      }
      if (!navigator.geolocation) {
        throw new Error("GPS is not available in this browser. Please open the app in a browser that supports location.");
      }

      const pos = await getCheckInPosition();
      const { latitude: lat, longitude: lng } = pos.coords;
      const checkedInAt = new Date().toISOString();
      const clientCheckInId = offlineEntityId("checkin");
      const result = await submitOfflineRequest({
        taskId,
        action: "checkin",
        label: "GPS check-in",
        entityId: clientCheckInId,
        url: `/api/tasks/${taskId}/checkin`,
        json: { lat, lng, targetLat, targetLng, checkedInAt, clientCheckInId },
      });
      if (result.queued) {
        updateLocalTask((current) => ({
          ...current,
          status: "IN_PROGRESS",
          checkIns: [...current.checkIns, { checkedInAt, lat, lng }],
        }));
        setGpsError("Saved offline. GPS check-in will sync automatically.");
        showQueuedNotice("GPS check-in");
      } else {
        const data = await result.response.json().catch(() => ({})) as { error?: string };
        if (!result.response.ok) throw new Error(data.error ?? "Check-in failed");
        await loadTask(true);
        setGpsErrorKey("");
      }
    } catch (err: unknown) {
      setGpsError(geolocationErrorMessage(err));
    } finally {
      setGpsLoadingKey("");
    }
  };

  const handleCheckInSos = async (location: WorkLocationGroup, locIdx: number) => {
    const locationId = locationKey(location, locIdx);
    setSosLoadingKey(locationId);
    setSosErrorKey(locationId);
    setSosError("");
    try {
      const targetLat = location.lat ?? task?.locationLat ?? null;
      const targetLng = location.lng ?? task?.locationLng ?? null;
      const requestedAt = new Date().toISOString();
      const result = await submitOfflineRequest({
        taskId,
        action: "checkin-sos",
        label: "SOS check-in request",
        url: `/api/tasks/${taskId}/checkin-sos`,
        json: { address: location.address, targetLat, targetLng, requestedAt },
      });
      const optimisticUpdate = (current: Task): Task => ({
        ...current,
        checkInSosRequestedAt: requestedAt,
        checkInSosAddress: location.address,
        checkInSosLat: targetLat,
        checkInSosLng: targetLng,
        checkInSosResolvedAt: null,
        checkInSosResolvedById: null,
        checkInSosResolver: null,
      });
      if (result.queued) {
        updateLocalTask(optimisticUpdate);
        setSosError("SOS saved offline. Managers will only receive it after internet returns.");
        showQueuedNotice("SOS check-in request");
      } else {
        const data = await result.response.json().catch(() => ({})) as { error?: string };
        if (!result.response.ok) throw new Error(data.error ?? "Could not send SOS check-in request.");
        updateLocalTask(optimisticUpdate);
        await loadTask(true);
      }
    } catch (err) {
      setSosError(err instanceof Error ? err.message : "Could not send SOS check-in request.");
    } finally {
      setSosLoadingKey("");
    }
  };

  // ─── Photo upload ────────────────────────────────────────────────────────────

  async function uploadPhotoFile(file: File, type: "ATTENDANCE" | "EVIDENCE", assetId?: string, replacePhotoId?: string) {
    if (photoUploadInFlightRef.current) return;
    photoUploadInFlightRef.current = true;
    setPhotoUploading(true);
    setError("");
    try {
      const label = type === "EVIDENCE" ? photoLabel.trim() : "";
      if (type === "EVIDENCE" && !label) {
        setAttendanceCameraError("Photo name is required.");
        return;
      }
      const form = new FormData();
      form.append("photo", file, type === "ATTENDANCE" ? "attendance-selfie.jpg" : "photo.jpg");
      form.append("type", type);
      form.append("label", label);
      if (assetId) form.append("assetId", assetId);
      if (replacePhotoId) form.append("photoId", replacePhotoId);
      const photoId = replacePhotoId ?? offlineEntityId("photo");
      const createdAt = new Date().toISOString();
      if (!replacePhotoId) form.append("clientPhotoId", photoId);
      form.append("createdAt", createdAt);

      const result = await submitOfflineRequest({
        taskId,
        action: replacePhotoId ? "photo-update" : "photo-create",
        label: replacePhotoId ? "Retake photo" : "Photo",
        entityId: photoId,
        url: `/api/tasks/${taskId}/photo`,
        method: replacePhotoId ? "PATCH" : "POST",
        formData: form,
      });
      if (result.queued) {
        const photoUrl = await fileToDataUrl(file);
        updateLocalTask((current) => ({
          ...current,
          servicePhotos: replacePhotoId
            ? current.servicePhotos.map((photo) => photo.id === replacePhotoId
              ? { ...photo, photoUrl, label }
              : photo)
            : [...current.servicePhotos, {
                id: photoId,
                photoUrl,
                type,
                assetId: assetId ?? null,
                label,
                createdAt,
              }],
        }));
        setPhotoLabel("");
        showQueuedNotice(type === "ATTENDANCE" ? "Attendance photo" : "Evidence photo");
        if (type === "EVIDENCE") scrollAssetPhotosIntoView(assetId);
      } else {
        if (!result.response.ok) throw new Error("Upload failed");
        setPhotoLabel("");
        await loadTask(true);
        if (type === "EVIDENCE") scrollAssetPhotosIntoView(assetId);
      }
    } catch {
      setError("Photo upload failed. Please try again.");
    } finally {
      photoUploadInFlightRef.current = false;
      setPhotoUploading(false);
    }
  }

  const handleDeletePhoto = async (photoId: string) => {
    setDeletingPhotoId(photoId);
    setError("");
    try {
      const removedPendingCreate = await removeQueuedEntity(taskId, photoId, "photo-create");
      if (removedPendingCreate > 0) {
        await removeQueuedEntity(taskId, photoId);
        updateLocalTask((current) => ({
          ...current,
          servicePhotos: current.servicePhotos.filter((photo) => photo.id !== photoId),
        }));
        return;
      }

      const result = await submitOfflineRequest({
        taskId,
        action: "photo-delete",
        label: "Delete photo",
        entityId: photoId,
        url: `/api/tasks/${taskId}/photo`,
        method: "DELETE",
        json: { photoId },
      });
      if (result.queued) {
        updateLocalTask((current) => ({
          ...current,
          servicePhotos: current.servicePhotos.filter((photo) => photo.id !== photoId),
        }));
        showQueuedNotice("Photo deletion");
      } else {
        if (!result.response.ok) throw new Error("Delete failed");
        await loadTask(true);
      }
    } catch {
      setError("Photo delete failed. Please try again.");
    } finally {
      setDeletingPhotoId("");
    }
  };

  const openEditPhoto = (photo: ServicePhoto) => {
    setEditingPhoto(photo);
    setEditingPhotoLabel(photo.label ?? "");
    setAttendanceCameraError("");
  };

  const closeEditPhoto = () => {
    if (editPhotoSaving) return;
    setEditingPhoto(null);
    setEditingPhotoLabel("");
  };

  const handleSavePhotoEdit = async () => {
    if (!editingPhoto) return;
    const label = editingPhotoLabel.trim();
    if (editingPhoto.type === "EVIDENCE" && !label) {
      setError("Photo name is required.");
      return;
    }

    setEditPhotoSaving(true);
    setError("");
    try {
      const result = await submitOfflineRequest({
        taskId,
        action: "photo-update",
        label: "Photo name",
        entityId: editingPhoto.id,
        coalesceKey: `photo-label:${editingPhoto.id}`,
        url: `/api/tasks/${taskId}/photo`,
        method: "PATCH",
        json: { photoId: editingPhoto.id, label },
      });
      if (result.queued) {
        updateLocalTask((current) => ({
          ...current,
          servicePhotos: current.servicePhotos.map((photo) =>
            photo.id === editingPhoto.id ? { ...photo, label } : photo
          ),
        }));
        setEditingPhoto(null);
        setEditingPhotoLabel("");
        showQueuedNotice("Photo name");
      } else {
        if (!result.response.ok) throw new Error("Photo update failed");
        setEditingPhoto(null);
        setEditingPhotoLabel("");
        await loadTask(true);
      }
    } catch {
      setError("Photo update failed. Please try again.");
    } finally {
      setEditPhotoSaving(false);
    }
  };

  const openRetakeEvidencePhoto = async (photo: ServicePhoto) => {
    setAttendanceCameraError("");
    setPhotoLabel(editingPhotoLabel.trim() || photo.label || "");
    setLivePhotoType("EVIDENCE");
    pendingPhoto.current = { type: "EVIDENCE", assetId: photo.assetId ?? undefined, photoId: photo.id };
    pendingAttendanceLocation.current = null;
    setEditingPhoto(null);
    setEditingPhotoLabel("");
    setAttendanceCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      attendanceStreamRef.current = stream;
      if (attendanceVideoRef.current) {
        attendanceVideoRef.current.srcObject = stream;
        await attendanceVideoRef.current.play();
      }
    } catch {
      setAttendanceCameraError("Camera permission denied. Please allow camera access to retake this photo.");
    }
  };

  const saveAssetRemark = useCallback(async (asset: Asset) => {
    const previousSave = assetRemarkSaveChainsRef.current.get(asset.id) ?? Promise.resolve();
    const currentSave = previousSave.catch(() => undefined).then(async () => {
      if (!dirtyAssetRemarkIdsRef.current.has(asset.id)) return;

      const technicianRemark = assetRemarksRef.current[asset.id] ?? "";
      const result = await submitOfflineRequest({
        taskId,
        action: "remark",
        label: "Technician remark",
        entityId: asset.id,
        coalesceKey: `remark:${taskId}:${asset.id}`,
        url: `/api/tasks/${taskId}`,
        method: "PATCH",
        json: { assetId: asset.id, technicianRemark },
      });

      let savedRemark = technicianRemark.trim();
      if (result.queued) {
        queuedAssetRemarkDraftsRef.current[asset.id] = savedRemark;
        showQueuedNotice("Technician remark");
      } else {
        const data = await result.response.json().catch(() => ({})) as { error?: string; technicianRemark?: string | null };
        if (!result.response.ok) throw new Error(data.error ?? "Remark update failed");
        savedRemark = data.technicianRemark ?? "";
        delete queuedAssetRemarkDraftsRef.current[asset.id];
      }

      // Do not clear or replace a newer draft typed while this request was in
      // flight. Its debounce/blur save will run immediately afterwards.
      if ((assetRemarksRef.current[asset.id] ?? "") === technicianRemark) {
        dirtyAssetRemarkIdsRef.current.delete(asset.id);
        assetRemarksRef.current = { ...assetRemarksRef.current, [asset.id]: savedRemark };
        setAssetRemarks((current) => ({ ...current, [asset.id]: savedRemark }));
      }

      updateLocalTask((current) => ({
        ...current,
        assets: current.assets.map((currentAsset) => currentAsset.id === asset.id
          ? { ...currentAsset, technicianRemark: savedRemark || null }
          : currentAsset),
      }));
    });

    assetRemarkSaveChainsRef.current.set(asset.id, currentSave);
    try {
      await currentSave;
    } finally {
      if (assetRemarkSaveChainsRef.current.get(asset.id) === currentSave) {
        assetRemarkSaveChainsRef.current.delete(asset.id);
      }
    }
  }, [showQueuedNotice, taskId, updateLocalTask]);

  const saveAssetRemarks = useCallback(async () => {
    if (!task) return;
    const dirtyAssets = task.assets.filter((asset) => dirtyAssetRemarkIdsRef.current.has(asset.id));
    for (const asset of dirtyAssets) {
      await saveAssetRemark(asset);
    }
  }, [saveAssetRemark, task]);

  useEffect(() => {
    if (!task || task.clockOutAt || dirtyAssetRemarkIdsRef.current.size === 0) return;
    const timer = window.setTimeout(() => {
      void saveAssetRemarks().catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Remark update failed");
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [assetRemarks, saveAssetRemarks, task]);

  const handleNext = async () => {
    setNextLoading(true);
    setError("");
    setShowPaymentStep(true);
    try {
      await saveAssetRemarks();
      await loadTask(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Remark update failed");
    } finally {
      setNextLoading(false);
    }
  };

  async function handleAddWorkItem() {
    if (!newWorkCategoryId) {
      setError("Please choose a job category to continue repair.");
      return;
    }
    setAddingWorkItem(true);
    setError("");
    try {
      const clientAssetId = offlineEntityId("asset");
      const result = await submitOfflineRequest({
        taskId,
        action: "work-item",
        label: "Additional work item",
        entityId: clientAssetId,
        url: `/api/tasks/${taskId}/work-items`,
        json: {
          jobCategoryId: newWorkCategoryId,
          billingType: newWorkBillingType,
          clientAssetId,
        },
      });
      if (result.queued) {
        if (!selectedRepairCategory) throw new Error("Job category not found.");
        const unitPrice = Number(selectedRepairCategory.price) || 0;
        updateLocalTask((current) => ({
          ...current,
          totalPrice: String(
            Number(current.totalPrice) + (newWorkBillingType === "CHARGEABLE" ? unitPrice : 0)
          ),
          assets: [...current.assets, {
            id: clientAssetId,
            label: "",
            acType: "Work Item",
            unitPrice: String(unitPrice),
            billingType: newWorkBillingType,
            isTroubleshoot: false,
            remarks: null,
            technicianRemark: null,
            propertyType: "Service",
            workLocationAddress: current.locationAddress,
            workLocationLat: current.locationLat,
            workLocationLng: current.locationLng,
            jobCategory: {
              id: selectedRepairCategory.id,
              name: selectedRepairCategory.name,
              price: selectedRepairCategory.price,
              minEvidencePhotos: selectedRepairCategory.minEvidencePhotos,
            },
          }],
        }));
        setContinueRepairOpen(false);
        setNewWorkCategoryId("");
        setNewWorkBillingType("CHARGEABLE");
        showQueuedNotice("Additional work item");
        scrollAssetPhotosIntoView(clientAssetId);
      } else {
        const data = await result.response.json().catch(() => ({})) as { error?: string; id?: string };
        if (!result.response.ok) throw new Error(data.error ?? "Could not add work item.");
        const createdAssetId = typeof data.id === "string" ? data.id : "";
        setContinueRepairOpen(false);
        setNewWorkCategoryId("");
        setNewWorkBillingType("CHARGEABLE");
        await loadTask(true);
        if (createdAssetId) scrollAssetPhotosIntoView(createdAssetId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add work item.");
    } finally {
      setAddingWorkItem(false);
    }
  }

  function stopAttendanceCamera() {
    attendanceStreamRef.current?.getTracks().forEach((track) => track.stop());
    attendanceStreamRef.current = null;
    if (attendanceVideoRef.current) attendanceVideoRef.current.srcObject = null;
    setAttendanceCameraOpen(false);
  }

  const openAttendanceCamera = async (location?: WorkLocationGroup) => {
    setAttendanceCameraError("");
    setPhotoLabel("");
    setLivePhotoType("ATTENDANCE");
    pendingPhoto.current = { type: "ATTENDANCE" };
    pendingAttendanceLocation.current = location ?? null;
    setAttendanceCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      attendanceStreamRef.current = stream;
      if (attendanceVideoRef.current) {
        attendanceVideoRef.current.srcObject = stream;
        await attendanceVideoRef.current.play();
      }
    } catch {
      setAttendanceCameraError("Camera permission denied. Please allow camera access to take attendance selfie.");
    }
  };

  const openEvidenceCamera = async (assetId: string) => {
    setAttendanceCameraError("");
    setPhotoLabel("");
    setLivePhotoType("EVIDENCE");
    pendingPhoto.current = { type: "EVIDENCE", assetId };
    pendingAttendanceLocation.current = null;
    setAttendanceCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      attendanceStreamRef.current = stream;
      if (attendanceVideoRef.current) {
        attendanceVideoRef.current.srcObject = stream;
        await attendanceVideoRef.current.play();
      }
    } catch {
      setAttendanceCameraError("Camera permission denied. Please allow camera access to take live photo.");
    }
  };

  const openReceiptCamera = async () => {
    setAttendanceCameraError("");
    setPhotoLabel("");
    setLivePhotoType("RECEIPT");
    pendingPhoto.current = { type: "RECEIPT" };
    pendingAttendanceLocation.current = null;
    setAttendanceCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      attendanceStreamRef.current = stream;
      if (attendanceVideoRef.current) {
        attendanceVideoRef.current.srcObject = stream;
        await attendanceVideoRef.current.play();
      }
    } catch {
      setAttendanceCameraError("Camera permission denied. Please allow camera access to take live receipt photo.");
    }
  };

  const captureAttendanceSelfie = async () => {
    if (photoCaptureInFlightRef.current || photoUploadInFlightRef.current) return;
    photoCaptureInFlightRef.current = true;
    setPhotoUploading(true);
    try {
      const video = attendanceVideoRef.current;
      if (!video) return;
      const pending = pendingPhoto.current;
      const type = pending?.type ?? "ATTENDANCE";
      const label = type === "EVIDENCE" ? photoLabel.trim() : "";
      if (type === "EVIDENCE" && !label) {
        setAttendanceCameraError("Photo name is required.");
        return;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 720;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
      if (!blob) {
        setAttendanceCameraError("Could not capture selfie. Please try again.");
        return;
      }

      const attendanceAssetId = pending?.type === "ATTENDANCE" && pendingAttendanceLocation.current
        ? getLocationAssetIds(pendingAttendanceLocation.current)[0]
        : undefined;
      const assetId = type === "ATTENDANCE" ? attendanceAssetId : pending?.assetId;
      const filename =
        type === "ATTENDANCE" ? "attendance-selfie.jpg" :
        type === "RECEIPT" ? "payment-receipt.jpg" :
        "evidence-photo.jpg";
      const file = new File([blob], filename, { type: "image/jpeg" });
      stopAttendanceCamera();
      if (type === "RECEIPT") {
        applyReceiptFile(file);
        return;
      }
      await uploadPhotoFile(file, type, assetId, pending?.photoId);
    } finally {
      photoCaptureInFlightRef.current = false;
      if (!photoUploadInFlightRef.current) setPhotoUploading(false);
    }
  };

  // ─── Payment ─────────────────────────────────────────────────────────────────

  const handlePayment = async () => {
    if (payMethod !== "OFFICE" && !receiptFile) {
      setError("Please take a live receipt photo before confirming payment.");
      return;
    }

    setPayLoading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("method", payMethod);
      if (receiptFile && payMethod !== "OFFICE") form.append("receipt", receiptFile);
      const clientPaymentId = offlineEntityId("payment");
      const submittedAt = new Date().toISOString();
      form.append("clientPaymentId", clientPaymentId);
      form.append("submittedAt", submittedAt);
      const queuedReceiptUrl = receiptFile ? await fileToDataUrl(receiptFile) : "";

      const result = await submitOfflineRequest({
        taskId,
        action: "payment",
        label: "Payment evidence",
        entityId: clientPaymentId,
        url: `/api/tasks/${taskId}/payment`,
        formData: form,
      });
      if (result.queued) {
        updateLocalTask((current) => ({
          ...current,
          payments: [{
            id: clientPaymentId,
            method: payMethod,
            status: "PENDING",
            receiptPhotoUrl: queuedReceiptUrl || null,
          }, ...current.payments],
        }));
        applyReceiptFile(null);
        showQueuedNotice("Payment evidence");
      } else {
        const data = await result.response.json().catch(() => ({})) as { error?: string };
        if (!result.response.ok) throw new Error(data.error ?? "Payment failed");
        applyReceiptFile(null);
        await loadTask(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Payment submission failed");
    } finally {
      setPayLoading(false);
    }
  };

  // ─── Checkout (clock-out) ─────────────────────────────────────────────────────

  const handleCheckout = async () => {
    setCheckoutLoading(true);
    try {
      const occurredAt = new Date().toISOString();
      const result = await submitOfflineRequest({
        taskId,
        action: "checkout",
        label: "Checkout",
        url: `/api/tasks/${taskId}/checkout`,
        json: { occurredAt },
      });
      if (result.queued) {
        updateLocalTask((current) => ({ ...current, clockOutAt: occurredAt }));
        showQueuedNotice("Checkout");
      } else if (!result.response.ok) {
        let data: { error?: string } = {};
        try { data = await result.response.json(); } catch { /* ignore non-JSON errors */ }
        throw new Error(data.error ?? "Could not check out.");
      } else {
        await loadTask(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check out.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  // ─── Mark urgent (flag for manager/admin/supervisor) ──────────────────────────

  const handleMarkUrgent = async () => {
    const reason = urgentReason.trim();
    if (!reason) { setUrgentError("Please describe why this task is urgent."); return; }
    setUrgentLoading(true);
    setUrgentError("");
    try {
      const occurredAt = new Date().toISOString();
      const result = await submitOfflineRequest({
        taskId,
        action: "urgent",
        label: "Urgent task alert",
        url: `/api/tasks/${taskId}/urgent`,
        json: { reason, occurredAt },
      });
      if (result.queued) {
        setUrgentOpen(false);
        setUrgentReason("");
        updateLocalTask((current) => ({ ...current, urgent: true, urgentReason: reason }));
        setUrgentError("Saved offline. Managers will receive the alert after internet returns.");
        showQueuedNotice("Urgent task alert");
      } else {
        let data: { error?: string } = {};
        try { data = await result.response.json(); } catch { /* non-JSON error body */ }
        if (!result.response.ok) throw new Error(data.error ?? `Could not flag as urgent (HTTP ${result.response.status})`);
        setUrgentOpen(false);
        setUrgentReason("");
        updateLocalTask((current) => ({ ...current, urgent: true, urgentReason: reason }));
        void loadTask(true);
      }
    } catch (err) {
      setUrgentError(err instanceof Error ? err.message : "Could not flag as urgent");
    } finally {
      setUrgentLoading(false);
    }
  };

  // ─── Submit report ────────────────────────────────────────────────────────────

  const handleSubmitReport = async () => {
    // The signer is the attending team (team-device account), not an individual.
    const signer = (task?.teams ?? []).map((t) => t.name).filter(Boolean).join(", ") || (task?.technician?.name ?? "");
    // Use a freshly drawn signature if its pad is open & non-empty, else keep the saved one.
    const techSig = (techPad.current && !techPad.current.isEmpty()) ? techPad.current.toDataURL() : savedTechSig;
    const clientSig = (clientPad.current && !clientPad.current.isEmpty()) ? clientPad.current.toDataURL() : savedClientSig;
    if (!techSig) { setError("Please provide technician signature"); return; }
    if (!clientSig) { setError("Please have client sign"); return; }

    setSubmitLoading(true);
    setError("");
    try {
      await saveAssetRemarks();
      const submittedAt = new Date().toISOString();
      const result = await submitOfflineRequest({
        taskId,
        action: "report",
        label: "Signed service report",
        url: `/api/tasks/${taskId}/report`,
        json: {
          technicianName: signer,
          technicianSignature: techSig,
          clientSignature: clientSig,
          submittedAt,
        },
      });
      if (result.queued) {
        updateLocalTask((current) => ({
          ...current,
          status: "DONE",
          report: {
            id: offlineEntityId("report"),
            technicianSignature: techSig,
            clientSignature: clientSig,
          },
        }));
        setResignTech(false);
        setResignClient(false);
        showQueuedNotice("Signed service report");
      } else {
        const data = await result.response.json().catch(() => ({})) as { error?: string; pdfUrl: string; whatsappLink: string };
        if (!result.response.ok) throw new Error(data.error ?? "Submission failed");
        setDoneResult({ pdfUrl: data.pdfUrl, whatsappLink: data.whatsappLink });
        setResignTech(false);
        setResignClient(false);
        await loadTask(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitLoading(false);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="text-center py-16 text-gray-400">
        <AlertCircle className="w-10 h-10 mx-auto mb-3" />
        <p>Task not found or could not be loaded.</p>
      </div>
    );
  }

  const orderedServicePhotos = sortServicePhotos(task.servicePhotos);
  const attendancePhotos = orderedServicePhotos.filter((p) => p.type === "ATTENDANCE");
  const evidencePhotos = orderedServicePhotos.filter((p) => p.type === "EVIDENCE");
  const hasCheckedIn = task.checkIns.length > 0;
  const latestPayment = task.payments[0] ?? null;
  const approvedPayment = task.payments.find((payment) => payment.status === "APPROVED") ?? null;
  const hasPayment = !!latestPayment;
  const hasApprovedPayment = !!approvedPayment;
  const isWarranty = task.billingType === "WARRANTY";
  const chargeableTotal = Number(task.totalPrice) || 0;
  const isFullyFoc = chargeableTotal <= 0;
  const paymentRequired = chargeableTotal > 0;
  const isCheckedOut = !!task.clockOutAt;
  const isDone = isCheckedOut;
  const reportSubmitted = task.status === "DONE" || !!task.report;
  const hasStarted = task.status !== "COMING_SOON";
  const previousAppointment = task.previousAppointment ?? null;
  const previousEvidencePhotos = previousAppointment?.servicePhotos.filter((photo) => photo.type === "EVIDENCE") ?? [];
  const previousAttendancePhotos = previousAppointment?.servicePhotos.filter((photo) => photo.type === "ATTENDANCE") ?? [];

  // The signer is the attending team itself (team-device account), not an individual.
  const teamName = (task.teams ?? []).map((t) => t.name).filter(Boolean).join(", ");
  const signerName = teamName || (task.technician?.name ?? "");

  // Stepper position derived entirely from server data — no local step state
  const workLocations = buildTaskWorkLocations(task);
  const requiredEvidencePhotos = Math.max(3, minEvidencePhotos);
  const fallbackEvidencePhotos = Math.max(3, minEvidencePhotos);
  const currentStep = deriveStep(task, fallbackEvidencePhotos);

  function wazeLink(address: string, lat: number | null, lng: number | null) {
    return buildWazeLink(address, lat, lng);
  }

  function whatsappLink(phone: string) {
    if (!EXTERNAL_WHATSAPP_ENABLED) return "#";
    const digits = phone.replace(/\D/g, "").replace(/^0/, "");
    return `https://wa.me/60${digits}`;
  }

  async function regenerateReportPdf(fallbackUrl: string, fallbackShareLink: string) {
    try {
      const response = await fetch(`/api/appointments/${taskId}/report/regenerate`, {
        method: "POST",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Could not regenerate report");
      const data = await response.json() as { pdfUrl?: string; whatsappLink?: string };
      if (data.pdfUrl) {
        void loadTask(true);
        return { url: data.pdfUrl, shareLink: data.whatsappLink ?? fallbackShareLink };
      }
    } catch {
      // Keep old PDFs reachable if regeneration fails for a legacy record.
    }
    return { url: fallbackUrl, shareLink: fallbackShareLink };
  }

  async function openPdf(url: string, shareLink: string) {
    if (!url) return;
    if (pdfOpenPending) return;
    setPdfOpenPending(true);
    try {
      const freshReport = await regenerateReportPdf(url, shareLink);
      const abs = normalizeUploadUrl(freshReport.url);
      const href = abs.startsWith("http") ? abs : `${window.location.origin}${abs}`;
      const viewUrl = new URL(href);
      viewUrl.searchParams.set("v", String(Date.now()));
      setPdfViewer({ url: href, viewUrl: viewUrl.toString(), whatsappLink: freshReport.shareLink });
    } finally {
      setPdfOpenPending(false);
    }
  }

  async function handlePdfDownload() {
    if (!pdfViewer || pdfDownloadPending) return;
    setPdfDownloadPending(true);
    try {
      const response = await fetch(pdfViewer.viewUrl, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not prepare PDF (HTTP ${response.status})`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `service-report-${taskId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch {
      const link = document.createElement("a");
      link.href = pdfViewer.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } finally {
      setPdfDownloadPending(false);
    }
  }

  function reportWhatsappLink(url: string, phone: string) {
    const abs = normalizeUploadUrl(url);
    const href = abs.startsWith("http") ? abs : `${window.location.origin}${abs}`;
    return `${whatsappLink(phone)}?text=${encodeURIComponent(`Service report from Megtras: ${href}`)}`;
  }

  function locationKey(loc: WorkLocationGroup, locIdx: number) {
    return `${loc.address}-${locIdx}`;
  }

  function getLocationAssetIds(loc: WorkLocationGroup) {
    return loc.propertyGroups.flatMap((group) => group.assets.map((asset) => asset.id));
  }

  const getLocationCheckIn = (loc: WorkLocationGroup) => {
    if (loc.lat == null || loc.lng == null) return null;
    return task.checkIns.find((checkIn) =>
      distanceInMeters(checkIn.lat, checkIn.lng, loc.lat!, loc.lng!) <= geofenceRadius
    ) ?? null;
  };

  const isLocationSosPending = (loc: WorkLocationGroup) => {
    if (!task.checkInSosRequestedAt || task.checkInSosResolvedAt) return false;
    if (task.checkInSosAddress && task.checkInSosAddress === loc.address) return true;
    return loc.lat != null && loc.lng != null && task.checkInSosLat === loc.lat && task.checkInSosLng === loc.lng;
  };

  const getLocationAttendancePhoto = (loc: WorkLocationGroup) => {
    const assetIds = getLocationAssetIds(loc);
    const locationPhoto = attendancePhotos.find((photo) => photo.assetId && assetIds.includes(photo.assetId));
    if (locationPhoto) return locationPhoto;
    return workLocations.length === 1
      ? attendancePhotos.find((photo) => !photo.assetId) ?? null
      : null;
  };

  const getAssetEvidencePhotos = (assetId: string) =>
    evidencePhotos.filter((photo) => photo.assetId === assetId);

  const locationEvidenceComplete = (loc: WorkLocationGroup) => {
    const assets = loc.propertyGroups.flatMap((group) => group.assets);
    const assetIds = assets.map((asset) => asset.id);
    if (assetIds.length === 0) return evidencePhotos.length >= requiredEvidencePhotos;
    return assets.every((asset) => getAssetEvidencePhotos(asset.id).length >= evidenceRequirementForAsset(asset, fallbackEvidencePhotos));
  };

  const activeUnsettledLocationId = workLocations.map((loc, locIdx) => {
    const locationId = locationKey(loc, locIdx);
    return getLocationCheckIn(loc) && (!getLocationAttendancePhoto(loc) || !locationEvidenceComplete(loc)) ? locationId : "";
  }).find(Boolean) ?? "";
  const hasEnoughPhotos = workLocations.length > 0
    ? workLocations.every((loc) => !!getLocationAttendancePhoto(loc) && locationEvidenceComplete(loc))
    : attendancePhotos.length > 0 && evidencePhotos.length >= requiredEvidencePhotos;
  const troubleshootAssets = task.assets.filter((asset) => asset.isTroubleshoot || isTroubleshootCategoryName(asset.jobCategory?.name));
  const hasTroubleshootWork = troubleshootAssets.length > 0;
  const hasAdditionalWorkItems = hasTroubleshootWork && task.assets.some((asset) => !troubleshootAssets.some((troubleAsset) => troubleAsset.id === asset.id));
  const troubleshootReady = hasTroubleshootWork && troubleshootAssets.every((asset) => getAssetEvidencePhotos(asset.id).length >= evidenceRequirementForAsset(asset, fallbackEvidencePhotos));
  const showTroubleshootDecision = hasTroubleshootWork && !hasAdditionalWorkItems && troubleshootReady && !showPaymentStep && !hasPayment && !isDone;
  const repairCategoryOptions = (task.jobCategories ?? []).filter((category) => !isTroubleshootCategoryName(category.name));
  const selectedRepairCategory = repairCategoryOptions.find((category) => category.id === newWorkCategoryId) ?? null;
  const canGoNext = hasStarted && hasEnoughPhotos && !isDone;
  const repairSelectionActive = showTroubleshootDecision;
  const paymentStepVisible = paymentRequired && (hasPayment || showPaymentStep);
  const signatureStepVisible = (hasPayment || (isFullyFoc && hasEnoughPhotos)) && !isDone && !repairSelectionActive;
  const focNoticeVisible = isFullyFoc && hasEnoughPhotos && !isDone && !repairSelectionActive;
  const assetEditingLocked = paymentStepVisible || nextLoading || isDone;
  const canDeleteTaskPhotos = !paymentStepVisible && !isDone;
  const startStageVisible = !hasStarted && !isDone;
  const checkInStepVisible = hasStarted || isDone;
  const assetStepVisible = attendancePhotos.length > 0 || paymentStepVisible || hasPayment || isDone;
  const urgentStepVisible = paymentStepVisible && !isDone;
  const checkoutStageVisible = reportSubmitted && !isCheckedOut;
  const hideBeforeCheckoutOnMobile = checkoutStageVisible ? "hidden md:block" : "";
  // Cash & QR/Transfer both need a live receipt photo before confirming; Pay Office does not.
  const canSubmitPayment = payMethod === "OFFICE" || !!receiptFile;

  return (
    <div ref={taskRootRef} className="max-w-2xl mx-auto space-y-4">
      {attendanceCameraOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                {livePhotoType === "ATTENDANCE" ? "Attendance Selfie" : livePhotoType === "RECEIPT" ? "Payment Receipt" : "Evidence Photo"}
              </h2>
              <button type="button" onClick={stopAttendanceCamera} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-hidden rounded-lg bg-black aspect-[3/4]">
              <video
                ref={attendanceVideoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            </div>
            {livePhotoType === "EVIDENCE" && (
              <div className="space-y-1.5">
                <label htmlFor="evidence-photo-label" className="text-xs font-medium text-gray-500">
                  Photo Name
                </label>
                <input
                  id="evidence-photo-label"
                  value={photoLabel}
                  onChange={(e) => setPhotoLabel(e.target.value)}
                  placeholder="e.g. Before service, Gas pressure, Drain pipe"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}
            {attendanceCameraError && (
              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                {attendanceCameraError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={stopAttendanceCamera}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={captureAttendanceSelfie}
                disabled={photoUploading || !!attendanceCameraError || (livePhotoType === "EVIDENCE" && !photoLabel.trim())}
                className="flex-1 rounded-lg bg-[#151513] py-2.5 text-sm font-semibold text-white hover:bg-[#26251f] disabled:bg-[#151513]/50"
              >
                {photoUploading ? "Uploading..." : livePhotoType === "ATTENDANCE" ? "Capture Selfie" : "Take live photo"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editingPhoto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">Edit Work Progress Photo</h2>
              <button type="button" onClick={closeEditPhoto} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <img
              src={normalizeUploadUrl(editingPhoto.photoUrl)}
              alt={editingPhoto.label || "Work progress photo"}
              className="h-48 w-full rounded-lg border border-gray-200 object-contain bg-gray-50"
            />
            <div className="space-y-1.5">
              <label htmlFor="edit-photo-name" className="text-xs font-medium text-gray-500">
                Photo Name
              </label>
              <input
                id="edit-photo-name"
                value={editingPhotoLabel}
                onChange={(e) => setEditingPhotoLabel(e.target.value)}
                placeholder="e.g. Before service, Gas pressure, Drain pipe"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => openRetakeEvidencePhoto(editingPhoto)}
                disabled={editPhotoSaving}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:bg-gray-100 disabled:text-gray-400"
              >
                <Camera className="w-4 h-4" />
                Retake Photo
              </button>
              <button
                type="button"
                onClick={handleSavePhotoEdit}
                disabled={editPhotoSaving || !editingPhotoLabel.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#151513] py-2.5 text-sm font-semibold text-white hover:bg-[#26251f] disabled:bg-[#151513]/50"
              >
                {editPhotoSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {previousPreviewOpen && previousAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
              <div>
                <h2 className="font-semibold text-gray-900">Previous Appointment Details</h2>
                <p className="text-xs text-gray-500">
                  GP-{String(previousAppointment.jobNo ?? "").padStart(4, "0")} · {previousAppointment.status.replaceAll("_", " ")}
                </p>
              </div>
              <button type="button" onClick={() => setPreviousPreviewOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-4">
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-base font-semibold text-gray-900">{previousAppointment.jobTitle || "Previous appointment"}</p>
                    {previousAppointment.jobCategory && (
                      <p className="text-sm font-medium text-gray-700">{previousAppointment.jobCategory.name}</p>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-blue-700">RM {Number(previousAppointment.totalPrice).toFixed(2)}</p>
                </div>
                <div className="grid gap-2 border-t border-gray-200 pt-2 text-sm text-gray-600 sm:grid-cols-2">
                  <p><span className="text-xs font-semibold uppercase text-gray-400">Customer</span><br />{previousAppointment.customer.name}</p>
                  <p><span className="text-xs font-semibold uppercase text-gray-400">Phone</span><br />{previousAppointment.customer.phone}</p>
                  <p><span className="text-xs font-semibold uppercase text-gray-400">Schedule</span><br />
                    {new Date(previousAppointment.date).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    {" · "}{previousAppointment.time}{previousAppointment.timeFinish ? `-${previousAppointment.timeFinish}` : ""}
                  </p>
                  <p><span className="text-xs font-semibold uppercase text-gray-400">Team</span><br />
                    {(previousAppointment.teams ?? []).map((team) => team.name).join(", ") || "Not assigned"}
                  </p>
                  <div className="sm:col-span-2">
                    <span className="text-xs font-semibold uppercase text-gray-400">Address</span>
                    <p>{previousAppointment.locationAddress || "Not available"}</p>
                    {(buildWazeLink(previousAppointment.locationAddress, previousAppointment.locationLat, previousAppointment.locationLng) || previousAppointment.locationWazeLink) && (
                      <a
                        href={buildWazeLink(previousAppointment.locationAddress, previousAppointment.locationLat, previousAppointment.locationLng) || previousAppointment.locationWazeLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-cyan-600 hover:underline"
                      >
                        <Navigation className="w-3 h-3" /> Open Waze <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Previous Assets</h3>
                {previousAppointment.assets.length > 0 ? previousAppointment.assets.map((asset) => (
                  <div key={asset.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{asset.acType || "Asset"}</p>
                        <p className="text-gray-600">{asset.jobCategory?.name || "No category"}</p>
                      </div>
                      <p className="font-semibold text-blue-700">RM {Number(asset.unitPrice ?? 0).toFixed(2)}</p>
                    </div>
                    {asset.remarks && (
                      <p className="mt-2 text-gray-600"><span className="font-medium text-gray-400">Remark:</span> {asset.remarks}</p>
                    )}
                    {asset.technicianRemark && (
                      <p className="mt-1 text-gray-600"><span className="font-medium text-gray-400">Technician Remark:</span> {asset.technicianRemark}</p>
                    )}
                  </div>
                )) : (
                  <p className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-400">No previous assets recorded.</p>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900">Previous Photos</h3>
                {previousAppointment.servicePhotos.filter((photo) => photo.type === "EVIDENCE").length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-gray-400">Work Progress</p>
                    <div className="flex flex-wrap gap-3">
                      {previousEvidencePhotos.map((photo, index) => (
                        <div key={photo.id} className="w-20">
                          <img
                            src={normalizeUploadUrl(photo.photoUrl)}
                            alt={photo.label || `Previous photo ${index + 1}`}
                            className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
                          />
                          <p className="mt-1 truncate text-center text-xs text-gray-600">{photo.label || `Photo ${index + 1}`}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {previousAttendancePhotos.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase text-gray-400">Attendance</p>
                    <div className="flex flex-wrap gap-3">
                      {previousAttendancePhotos.map((photo, index) => (
                        <div key={photo.id} className="w-20">
                          <img
                            src={normalizeUploadUrl(photo.photoUrl)}
                            alt={photo.label || `Attendance ${index + 1}`}
                            className="h-20 w-20 rounded-lg border border-gray-200 object-cover"
                          />
                          <p className="mt-1 truncate text-center text-xs text-gray-600">{photo.label || `Attendance ${index + 1}`}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {previousEvidencePhotos.length === 0 && previousAttendancePhotos.length === 0 && (
                  <p className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-400">No previous photos recorded.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Offline banner */}
      {!isOnline && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-amber-800 text-sm">
          <WifiOff className="w-4 h-4 shrink-0" />
          Offline mode — task updates and photos are saved on this device and synced automatically.
        </div>
      )}

      {offlineNotice && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm text-blue-800">
          <Cloud className="h-4 w-4 shrink-0" />
          <span className="flex-1">{offlineNotice}</span>
          <button type="button" onClick={() => setOfflineNotice("")} aria-label="Dismiss offline save message">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError("")}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className={hideBeforeCheckoutOnMobile}>
        <Stepper current={currentStep} />
      </div>

      {/* ─── Overview (always visible) ─── */}
      <div className={`bg-white rounded-xl border border-gray-200 p-4 space-y-3 ${hideBeforeCheckoutOnMobile}`}>

        {/* Name + status */}
        <div className="flex items-start justify-between">
          <div>
            <p className="font-semibold text-gray-900 text-lg">{task.customer.name}</p>
          </div>
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            task.status === "DONE" ? "bg-green-100 text-green-700" :
            task.status === "IN_PROGRESS" ? "bg-amber-100 text-amber-700" :
            "bg-blue-100 text-blue-700"
          }`}>
            {task.status === "COMING_SOON" ? "Upcoming" :
             task.status === "IN_PROGRESS" ? "In Progress" : "Done"}
          </span>
        </div>

        {/* Customer contact */}
        <div className="border-t pt-3 space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer Details</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-400">Phone Number 1</p>
              <div className="flex items-center gap-3 flex-wrap">
                <a href={`tel:${task.customer.phone}`}
                  className="flex items-center gap-1.5 text-sm text-blue-600 font-medium hover:underline">
                  <Phone className="w-3.5 h-3.5" />
                  {task.customer.phone}
                </a>
                <a href={whatsappLink(task.customer.phone)} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full hover:bg-green-100 transition">
                  <MessageCircle className="w-3 h-3" /> WhatsApp
                </a>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-400">Phone Number 2 (Emergency)</p>
              {task.customer.phone2 ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <a href={`tel:${task.customer.phone2}`}
                    className="flex items-center gap-1.5 text-sm text-blue-600 font-medium hover:underline">
                    <Phone className="w-3.5 h-3.5" />
                    {task.customer.phone2}
                  </a>
                  <a href={whatsappLink(task.customer.phone2)} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-green-600 font-medium bg-green-50 px-2 py-0.5 rounded-full hover:bg-green-100 transition">
                    <MessageCircle className="w-3 h-3" /> WhatsApp
                  </a>
                </div>
              ) : (
                <p className="text-sm text-gray-400">Emergency contact not available</p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-400">Email</p>
              {task.customer.email ? (
                <a href={`mailto:${task.customer.email}`}
                  className="flex items-center gap-1.5 text-sm text-gray-600 hover:underline">
                  <Mail className="w-3.5 h-3.5 text-gray-400" />
                  {task.customer.email}
                </a>
              ) : (
                <p className="text-sm text-gray-400">Not available</p>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-gray-400">District</p>
              <p className="text-sm text-gray-700">{task.customer.area || "Not available"}</p>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <p className="text-xs font-medium text-gray-400">Address</p>
              <div className="space-y-1">
                <p className="text-sm text-gray-700 leading-relaxed">{task.locationAddress || "Not available"}</p>
                {(buildWazeLink(task.locationAddress, task.locationLat, task.locationLng) || task.locationWazeLink) && (
                  <a href={buildWazeLink(task.locationAddress, task.locationLat, task.locationLng) || task.locationWazeLink} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-cyan-600 font-medium hover:underline">
                    <Navigation className="w-3 h-3" /> Open Waze
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Job details card (job title, team, date) ─── */}
      <div className={`bg-white rounded-xl border border-gray-200 p-4 space-y-3 ${hideBeforeCheckoutOnMobile}`}>
        {/* Job Title + category — matches the appointment form order (right after the customer) */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {task.jobTitle && <p className="text-base font-semibold text-gray-900">{task.jobTitle}</p>}
            {task.jobCategory && <p className="text-sm font-medium text-gray-700">{task.jobCategory.name}</p>}
          </div>
          {previousAppointment && (
            <button
              type="button"
              onClick={() => setPreviousPreviewOpen(true)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Previous Details
            </button>
          )}
        </div>

        {/* Team */}
        {task.teams && task.teams.length > 0 && (
          <div className="border-t pt-3">
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <Users className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                {task.teams.map((t) => (
                  <span key={t.id}>
                    <span className="font-medium">{t.name}</span>
                    {t.members.length > 0 && <span className="text-gray-400"> — {t.members.map((m) => m.name).join(", ")}</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Date + time */}
        <div className="border-t pt-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Clock className="w-4 h-4 text-gray-400" />
            {new Date(task.date).toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long" })}
            {" · "}{task.time}{task.timeFinish ? `–${task.timeFinish}` : ""}
          </div>
        </div>
      </div>

      {/* ─── 1. Check-in card ─── */}
      {startStageVisible && (
        <div className={`bg-white rounded-xl border border-gray-200 p-4 ${hideBeforeCheckoutOnMobile}`}>
          <button
            type="button"
            onClick={handleStartTask}
            disabled={startLoading}
            className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {startLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Start Task
          </button>
        </div>
      )}

      {checkInStepVisible && (
      <div className={`bg-white rounded-xl border border-gray-200 p-4 space-y-3 ${hideBeforeCheckoutOnMobile}`}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-[#151513] text-white">1</div>
            <h2 className="font-semibold text-gray-900">Check-in</h2>
            <span className="ml-auto text-xs font-medium text-blue-700 bg-blue-50 px-2 py-1 rounded-full">
              {workLocations.length} address{workLocations.length === 1 ? "" : "es"}
            </span>
          </div>

          {workLocations.length > 0 ? (
            <div className="space-y-3">
              {workLocations.map((loc, locIdx) => {
                const link = wazeLink(loc.address, loc.lat, loc.lng) || (locIdx === 0 ? task.locationWazeLink : "");
                const locationId = locationKey(loc, locIdx);
                const locationCheckIn = getLocationCheckIn(loc);
                const locationSosPending = isLocationSosPending(loc);
                const locationAttendancePhoto = getLocationAttendancePhoto(loc);
                const mustFinishCurrentLocation = !!activeUnsettledLocationId && activeUnsettledLocationId !== locationId;
                const canLocationCheckIn =
                  hasStarted && !locationCheckIn && !mustFinishCurrentLocation && loc.lat != null && loc.lng != null && !isDone;
                const canTakeLocationSelfie =
                  hasStarted && !!locationCheckIn && !locationAttendancePhoto && !mustFinishCurrentLocation && !isDone;
                return (
                  <div key={`${loc.address}-${locIdx}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-3">
                    <div className="flex items-start gap-2">
                      <MapPin className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-500 mb-0.5">Location {locIdx + 1}</p>
                        <p className="text-xs text-gray-700 leading-relaxed">{loc.address}</p>
                      </div>
                      {hasStarted && !locationCheckIn && !isDone && (
                        <button
                          type="button"
                          onClick={() => handleCheckInSos(loc, locIdx)}
                          disabled={locationSosPending || sosLoadingKey === locationId}
                          className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:bg-red-200 disabled:text-red-700"
                          title="Request SOS check-in help"
                        >
                          {sosLoadingKey === locationId ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
                          <span>SOS</span>
                        </button>
                      )}
                    </div>
                    {link && (
                      <a href={link} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-cyan-600 font-medium hover:underline">
                        <Navigation className="w-3 h-3" /> Open Waze
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {hasStarted && !isDone && (
                      <div className="space-y-2">
                        {!locationCheckIn && (
                          <p className="text-xs text-gray-500">
                            You must be within {geofenceRadius}m of this location to check in.
                          </p>
                        )}
                        {locationSosPending && (
                          <p className="text-xs text-red-600">
                            SOS sent. Waiting for supervisor/manager/admin push check-in.
                          </p>
                        )}
                        {sosError && sosErrorKey === locationId && (
                          <p className="text-xs text-red-600">{sosError}</p>
                        )}
                        {mustFinishCurrentLocation && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                            Please complete the checked-in location before starting another address.
                          </p>
                        )}
                        {locationCheckIn ? (
                          <div className="flex items-center gap-2 text-xs text-green-700">
                            <CheckCircle2 className="w-4 h-4" />
                            GPS check-in recorded
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCheckIn(loc, locIdx)}
                            disabled={!canLocationCheckIn || gpsLoadingKey === locationId}
                            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 text-white font-medium py-2.5 rounded-lg transition-colors"
                          >
                            {gpsLoadingKey === locationId ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                            GPS Check-In
                          </button>
                        )}
                        {gpsError && gpsErrorKey === locationId && (
                          <p className="text-xs text-red-600">
                            {gpsError}
                          </p>
                        )}
                        {canTakeLocationSelfie && (
                          <button
                            type="button"
                            onClick={() => openAttendanceCamera(loc)}
                            disabled={photoUploading}
                            className="w-full flex items-center justify-center gap-2 border border-blue-200 bg-white hover:bg-blue-50 disabled:bg-gray-100 text-blue-700 disabled:text-gray-400 font-medium py-2.5 rounded-lg transition-colors"
                          >
                            {photoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                            Take Attendance Selfie
                          </button>
                        )}
                        {locationAttendancePhoto && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs text-green-700">
                              <CheckCircle2 className="w-4 h-4" />
                              Attendance selfie recorded
                            </div>
                            <PhotoThumbnail
                              photo={locationAttendancePhoto}
                              alt={`Attendance selfie for location ${locIdx + 1}`}
                              onDelete={handleDeletePhoto}
                              deleting={deletingPhotoId === locationAttendancePhoto.id}
                              canDelete={canDeleteTaskPhotos}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p>{task.locationAddress}</p>
                {(buildWazeLink(task.locationAddress, task.locationLat, task.locationLng) || task.locationWazeLink) && (
                  <a href={buildWazeLink(task.locationAddress, task.locationLat, task.locationLng) || task.locationWazeLink} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1 text-xs text-cyan-600 font-medium hover:underline">
                    <Navigation className="w-3 h-3" /> Open Waze
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
      )}

      {/* ─── 2. Assets card ─── */}
      {assetStepVisible && (
      <div className={`bg-white rounded-xl border border-gray-200 p-4 space-y-3 ${hideBeforeCheckoutOnMobile}`}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-[#151513] text-white">2</div>
          <h2 className="font-semibold text-gray-900">Assets</h2>
        </div>
        {workLocations.length > 0 && (
          <div className="space-y-3">
            {workLocations.map((loc, locIdx) => {
              const locationAttendancePhoto = getLocationAttendancePhoto(loc);
              return (
                <div key={`assets-${loc.address}-${locIdx}`} className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-3">
                  {workLocations.length > 1 && (
                    <p className="text-xs font-semibold text-gray-500">Location {locIdx + 1} — {loc.address}</p>
                  )}
                  {loc.propertyGroups.length > 0 ? (
                    <div className="space-y-3">
                      {loc.propertyGroups.map((group) => (
                        <div key={`${loc.address}-${group.propertyType}`} className="space-y-3">
                          {group.assets.map((asset) => {
                            const assetPhotos = getAssetEvidencePhotos(asset.id);
                            const requiredEvidencePhotos = evidenceRequirementForAsset(asset, fallbackEvidencePhotos);
                            const requiredPhotoSlots = Math.max(requiredEvidencePhotos, assetPhotos.length);
                            const assetComplete = assetPhotos.length >= requiredEvidencePhotos;
                            const assetType = `${asset.acType ? `${asset.acType}: ` : ""}${asset.label}`;
                            const jobCategoryName = asset.jobCategory?.name ?? task.jobCategory?.name ?? "-";
                            const assetControlsVisible = !!locationAttendancePhoto && !assetEditingLocked;
                            const technicianRemarkValue = assetRemarks[asset.id] ?? "";

                            return (
                              <div key={asset.id} className="rounded-lg bg-white border border-gray-100 p-3 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="grid flex-1 grid-cols-[92px_1fr] gap-x-3 gap-y-2 text-sm">
                                    <p className="text-xs font-medium uppercase tracking-normal text-gray-400">Asset Type</p>
                                    <p className="font-semibold text-gray-800">{assetType}</p>

                                    <p className="text-xs font-medium uppercase tracking-normal text-gray-400">Job Category</p>
                                    <p className="text-gray-700">{jobCategoryName}</p>

                                    <p className="text-xs font-medium uppercase tracking-normal text-gray-400">Remark</p>
                                    <p className="text-gray-700">{asset.remarks || "-"}</p>
                                  </div>
                                  <div className="flex shrink-0 flex-col items-end gap-1">
                                    {asset.unitPrice != null && (
                                      <span className="text-xs font-semibold text-blue-700">RM {Number(asset.unitPrice).toFixed(2)}</span>
                                    )}
                                    {assetComplete && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                  </div>
                                </div>

                                <div className="border-t border-gray-100 pt-3 mb-4">
                                  <p className="text-xs font-medium uppercase tracking-normal text-gray-400">Property Type</p>
                                  <p className="text-sm font-semibold text-gray-800">{group.propertyType}</p>
                                  <p className="mt-1 text-sm text-gray-500">{loc.address}</p>
                                </div>

                                {!locationAttendancePhoto && !assetEditingLocked ? (
                                  <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
                                    Complete the attendance selfie for this location to unlock asset work updates.
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    <div
                                      ref={(node) => {
                                        assetPhotoSectionRefs.current[asset.id] = node;
                                      }}
                                      className="space-y-2 scroll-mt-20"
                                    >
                                      <p className="text-sm font-semibold text-gray-800">Work Progress Photos</p>
                                      <p className="text-xs text-gray-400">
                                        {assetPhotos.length}/{requiredEvidencePhotos} photos
                                      </p>
                                      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
                                        {Array.from({ length: requiredPhotoSlots }, (_, index) => {
                                          const photo = assetPhotos[index];

                                          return (
                                            <div key={`${asset.id}-photo-${index}`} className="w-20 space-y-1">
                                              {photo ? (
                                                <PhotoThumbnail
                                                  photo={photo}
                                                  alt={`${asset.label} evidence ${index + 1}`}
                                                  onDelete={handleDeletePhoto}
                                                  onEdit={openEditPhoto}
                                                  deleting={deletingPhotoId === photo.id}
                                                  canDelete={canDeleteTaskPhotos}
                                                  canEdit={assetControlsVisible}
                                                />
                                              ) : assetControlsVisible ? (
                                                <button
                                                  type="button"
                                                  onClick={() => openEvidenceCamera(asset.id)}
                                                  disabled={photoUploading || isDone}
                                                  className="w-20 h-20 flex items-center justify-center border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-lg text-gray-400 hover:text-blue-500 disabled:hover:border-gray-300 disabled:hover:text-gray-400 transition-colors"
                                                  aria-label={`Take live photo for ${asset.label}`}
                                                >
                                                  {photoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-5 h-5" />}
                                                  <span className="sr-only">Take live photo</span>
                                                </button>
                                              ) : (
                                                <div className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50" aria-hidden="true" />
                                              )}
                                              <p className="w-20 text-xs font-medium text-gray-500 text-center break-words leading-tight">{photo?.label || `Photo ${index + 1}`}</p>
                                            </div>
                                          );
                                        })}
                                        {assetPhotos.length >= requiredEvidencePhotos && assetControlsVisible && (
                                          <div className="w-20 space-y-1">
                                            <button
                                              type="button"
                                              onClick={() => openEvidenceCamera(asset.id)}
                                              disabled={photoUploading || isDone}
                                              className="w-20 h-20 flex items-center justify-center border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-lg text-gray-400 hover:text-blue-500 disabled:hover:border-gray-300 disabled:hover:text-gray-400 transition-colors"
                                              aria-label={`Add extra photo for ${asset.label}`}
                                            >
                                              {photoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-5 h-5" />}
                                              <span className="sr-only">Add Photo</span>
                                            </button>
                                            <p className="w-20 text-xs font-medium text-gray-500 text-center break-words leading-tight">Add Photo</p>
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {assetControlsVisible ? (
                                      <div className="space-y-1.5">
                                        <label htmlFor={`remark-${asset.id}`} className="text-xs font-medium text-gray-500">
                                          Remark <span className="font-normal text-gray-400">(optional)</span>
                                        </label>
                                        <textarea
                                          id={`remark-${asset.id}`}
                                          value={assetRemarks[asset.id] ?? ""}
                                          onChange={(e) => {
                                            const technicianRemark = e.target.value;
                                            dirtyAssetRemarkIdsRef.current.add(asset.id);
                                            assetRemarksRef.current = { ...assetRemarksRef.current, [asset.id]: technicianRemark };
                                            setAssetRemarks((prev) => ({ ...prev, [asset.id]: technicianRemark }));
                                          }}
                                          onBlur={() => {
                                            void saveAssetRemark(asset).catch((err: unknown) => {
                                              setError(err instanceof Error ? err.message : "Remark update failed");
                                            });
                                          }}
                                          disabled={reportSubmitted || isDone}
                                          rows={2}
                                          placeholder="Add technician notes for this asset"
                                          className="w-full resize-none rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
                                        />
                                      </div>
                                    ) : (
                                      <div className="space-y-1.5">
                                        <p className="text-xs font-medium text-gray-500">Technician Remark</p>
                                        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                                          {asset.technicianRemark || technicianRemarkValue || "-"}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No assets recorded for this location.</p>
                  )}

                </div>
              );
            })}
          </div>
        )}

        <div>
          <p className="text-base font-bold text-blue-700">{isFullyFoc ? "FOC" : `RM ${chargeableTotal.toFixed(2)}`}</p>
          {isWarranty && (
            <p className="text-xs font-medium text-[#151513]">
              {isFullyFoc ? "Warranty - no payment required" : "Warranty job - chargeable items included"}
            </p>
          )}
        </div>
      </div>

      )}
      {showTroubleshootDecision && (
        <div ref={repairDecisionBoundaryRef} className={`rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3 ${hideBeforeCheckoutOnMobile}`}>
          <div>
            <p className="text-sm font-semibold text-amber-900">Troubleshoot completed</p>
            <p className="text-xs text-amber-700">Stop the task now or continue with a repair/service work item in this same appointment.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleNext}
              disabled={!canGoNext || nextLoading}
              className="flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-white px-4 py-3 text-sm font-semibold text-amber-800 hover:bg-amber-100 disabled:bg-gray-100 disabled:text-gray-400"
            >
              {nextLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Stop Task
            </button>
            <button
              type="button"
              onClick={() => setContinueRepairOpen(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-[#151513] px-4 py-3 text-sm font-semibold text-white hover:bg-[#26251f]"
            >
              Continue Repair
            </button>
          </div>
        </div>
      )}

      {continueRepairOpen && !isDone && (
        <div
          ref={repairPickerRef}
          className={`rounded-xl border border-[#F2B705]/40 bg-white p-4 space-y-3 ${hideBeforeCheckoutOnMobile}`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-900">Add repair/service work item</p>
              <p className="text-xs text-gray-500">Price follows the selected inventory category.</p>
            </div>
            <button type="button" onClick={() => setContinueRepairOpen(false)} className="text-gray-400 hover:text-gray-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label htmlFor="repair-category" className="text-xs font-medium text-gray-500">Job Category</label>
              <select
                id="repair-category"
                value={newWorkCategoryId}
                onChange={(e) => setNewWorkCategoryId(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F2B705]"
              >
                <option value="">Select category</option>
                {repairCategoryOptions.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-gray-500">Price</p>
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-semibold text-blue-700">
                {selectedRepairCategory ? `RM ${Number(selectedRepairCategory.price).toFixed(2)}` : "RM 0.00"}
              </div>
            </div>
          </div>
          {isWarranty && (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setNewWorkBillingType("WARRANTY")}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${newWorkBillingType === "WARRANTY" ? "border-[#F2B705] bg-[#F2B705]/10 text-[#151513]" : "border-gray-200 text-gray-600 hover:border-[#F2B705]/60"}`}
              >
                FOC under Warranty
              </button>
              <button
                type="button"
                onClick={() => setNewWorkBillingType("CHARGEABLE")}
                className={`rounded-lg border px-3 py-2 text-sm font-semibold ${newWorkBillingType === "CHARGEABLE" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-gray-200 text-gray-600 hover:border-blue-300"}`}
              >
                Chargeable
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={handleAddWorkItem}
            disabled={addingWorkItem || !newWorkCategoryId}
            className="w-full rounded-xl bg-[#151513] px-4 py-3 text-sm font-semibold text-white hover:bg-[#26251f] disabled:bg-gray-300 disabled:text-gray-500"
          >
            {addingWorkItem ? "Adding..." : "Add Work Item"}
          </button>
        </div>
      )}

      {/* ─── Photos (unlocks after check-in) ─── */}
      {assetStepVisible && !showTroubleshootDecision && !hasPayment && !showPaymentStep && !signatureStepVisible && !isDone && (
        <button
          type="button"
          onClick={handleNext}
          disabled={!canGoNext || nextLoading}
          className={`w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:text-gray-500 text-white font-semibold py-3 transition-colors ${hideBeforeCheckoutOnMobile}`}
        >
          {nextLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {nextLoading ? "Saving..." : "Next"}
        </button>
      )}

      {false && task && hasCheckedIn && !isDone && (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${hasEnoughPhotos ? "bg-green-500 text-white" : "bg-[#151513] text-white"}`}>
              {hasEnoughPhotos ? <Check className="w-3.5 h-3.5" /> : "2"}
            </div>
            <h2 className="font-semibold text-gray-900">Evidence</h2>
            <span className="text-xs text-gray-400 ml-auto">
              {evidencePhotos.length}/{requiredEvidencePhotos} evidence
            </span>
          </div>

          {/* Evidence photos — per asset if assets exist, otherwise general */}
          {task!.assets.length > 0 ? (
            task!.assets.map((asset) => {
              const assetPhotos = evidencePhotos.filter((p) => p.assetId === asset.id);
              return (
                <div key={asset.id}>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    {asset.propertyType ? `${asset.propertyType}: ${asset.label}` : asset.label}
                    {(asset.workLocationAddress || asset.additionalAddress) && (
                      <span className="font-normal text-gray-400"> - {asset.workLocationAddress || asset.additionalAddress}</span>
                    )}
                    <span className="text-gray-400 font-normal"> ({assetPhotos.length} photos)</span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {assetPhotos.map((p) => (
                      <PhotoThumbnail
                        key={p.id}
                        photo={p}
                        alt="Evidence"
                        onDelete={handleDeletePhoto}
                        deleting={deletingPhotoId === p.id}
                        canDelete={canDeleteTaskPhotos}
                      />
                    ))}
                    <button
                      onClick={() => openEvidenceCamera(asset.id)}
                      disabled={photoUploading}
                      className="w-20 h-20 flex items-center justify-center border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-lg text-gray-400 hover:text-blue-500 transition-colors"
                    >
                      {photoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-5 h-5" />}
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Evidence Photos <span className="text-gray-400 font-normal">(min {requiredEvidencePhotos})</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {evidencePhotos.map((p) => (
                  <PhotoThumbnail
                    key={p.id}
                    photo={p}
                    alt="Evidence"
                    onDelete={handleDeletePhoto}
                    deleting={deletingPhotoId === p.id}
                    canDelete={canDeleteTaskPhotos}
                  />
                ))}
                <button
                  onClick={() => openEvidenceCamera(task!.assets[0]?.id ?? "")}
                  disabled={photoUploading}
                  className="w-20 h-20 flex items-center justify-center border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-lg text-gray-400 hover:text-blue-500 transition-colors"
                >
                  {photoUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-5 h-5" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Payment (unlocks after enough photos) ─── */}
      {paymentStepVisible && !isDone && (
        <div ref={paymentStepRef} className={`bg-white rounded-xl border border-gray-200 p-4 space-y-4 ${hideBeforeCheckoutOnMobile}`}>
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${hasApprovedPayment ? "bg-green-500 text-white" : "bg-[#151513] text-white"}`}>
              {hasApprovedPayment ? <Check className="w-3.5 h-3.5" /> : "3"}
            </div>
            <h2 className="font-semibold text-gray-900">Payment</h2>
          </div>

          {latestPayment ? (
            <div className={`flex items-center gap-2 text-sm ${hasApprovedPayment ? "text-green-700" : "text-amber-700"}`}>
              <CheckCircle2 className="w-4 h-4" />
              {!hasApprovedPayment && latestPayment.method === "QR_TRANSFER" && (
                <span>QR / Transfer payment is waiting for admin approval.</span>
              )}
              {task.payments[0].method.replaceAll("_", " ")} — {task.payments[0].status}
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                Total: <span className="font-bold text-gray-900">RM {chargeableTotal.toFixed(2)}</span>
              </p>

              <div className="grid grid-cols-3 gap-2">
                {(["CASH", "QR_TRANSFER", "OFFICE"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPayMethod(m)}
                    className={`py-2.5 rounded-xl text-sm font-medium border-2 transition-colors ${
                      payMethod === m
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {m === "QR_TRANSFER" ? "QR / Transfer" : m === "OFFICE" ? "Pay Office" : "Cash"}
                  </button>
                ))}
              </div>

              {payMethod !== "OFFICE" && (
                <div>
                  <p className="text-sm text-gray-600 mb-2">
                    Receipt photo <span className="text-red-500">(required)</span>
                  </p>
                  {receiptFile ? (
                    <div className="flex items-center gap-3">
                      <img
                        src={receiptPreviewUrl}
                        alt="Receipt"
                        className="w-16 h-16 object-cover rounded-lg border border-gray-200"
                      />
                      <button
                        onClick={() => applyReceiptFile(null)}
                        className="text-red-500 text-sm flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" /> Remove
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={openReceiptCamera}
                      className="flex items-center gap-2 border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl px-4 py-3 text-sm text-gray-500 hover:text-blue-600 transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                      Take live receipt photo
                    </button>
                  )}
                  {!receiptFile && (
                    <p className="mt-2 text-xs text-red-600">Take a live receipt photo to enable Confirm Payment.</p>
                  )}
                </div>
              )}

              {payMethod === "OFFICE" && (
                <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                  Client will pay directly at the office. No receipt required.
                </p>
              )}

              <button
                onClick={handlePayment}
                disabled={payLoading || !canSubmitPayment}
                className="w-full flex items-center justify-center gap-2 bg-[#151513] hover:bg-[#26251f] disabled:bg-gray-300 disabled:text-gray-500 text-white font-medium py-3 rounded-xl transition-colors"
              >
                {payLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                {payLoading ? "Submitting…" : "Confirm Payment"}
              </button>
            </div>
          )}
        </div>
      )}

      {focNoticeVisible && (
        <div className={`rounded-xl border border-[#F2B705]/40 bg-[#F2B705]/10 p-4 text-sm text-[#151513] ${hideBeforeCheckoutOnMobile}`}>
          <p className="font-semibold">{isWarranty ? "This job is covered under warranty. No payment is required." : "No payment is required for this job."}</p>
          {task.warrantyNote && <p className="mt-1 text-[#151513]">{task.warrantyNote}</p>}
        </div>
      )}

      {/* ─── Urgent flag — alert manager / admin / supervisor (after payment) ─── */}
      {urgentStepVisible && (
        <div className={`rounded-xl border p-4 space-y-3 ${task.urgent ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"} ${hideBeforeCheckoutOnMobile}`}>
          <div className="flex items-center gap-2">
            <AlertTriangle className={`w-5 h-5 ${task.urgent ? "text-red-600" : "text-gray-400"}`} />
            <h2 className="font-semibold text-gray-900">Urgent</h2>
            {task.urgent && <span className="ml-auto text-xs font-semibold text-red-700 bg-red-100 px-2.5 py-1 rounded-full">Flagged</span>}
          </div>

          {task.urgent ? (
            <div className="text-sm text-red-800">
              <p className="flex items-center gap-1.5 font-medium">
                <CheckCircle2 className="w-4 h-4 text-red-600 shrink-0" />
                Your urgent message has been sent to your management.
              </p>
              {task.urgentReason && (
                <p className="mt-2 rounded-lg bg-white border border-red-100 px-3 py-2 text-gray-700">{task.urgentReason}</p>
              )}
            </div>
          ) : urgentOpen ? (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Flag this task for your manager, admin and supervisor to review and take action.</p>
              <textarea value={urgentReason} onChange={(e) => setUrgentReason(e.target.value)} rows={3}
                placeholder="Describe why this task is urgent…"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500" />
              {urgentError && (
                <p className="flex items-center gap-1.5 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {urgentError}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={handleMarkUrgent} disabled={urgentLoading || !urgentReason.trim()}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white text-sm font-semibold py-2.5 transition">
                  {urgentLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                  Send Urgent Alert
                </button>
                <button type="button" onClick={() => { setUrgentOpen(false); setUrgentReason(""); }}
                  className="px-4 py-2.5 rounded-xl border border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setUrgentOpen(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-red-200 text-red-700 hover:bg-red-50 text-sm font-semibold py-2.5 transition">
              <AlertTriangle className="w-4 h-4" /> Mark as Urgent
            </button>
          )}
        </div>
      )}

      {/* ─── Signatures (unlocks once payment is recorded) ─── */}
      {signatureStepVisible && (
        <div className={`bg-white rounded-xl border border-gray-200 p-4 space-y-4 ${hideBeforeCheckoutOnMobile}`}>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold bg-[#151513] text-white">4</div>
            <h2 className="font-semibold text-gray-900">Signatures</h2>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Technician signing</p>
            <div className="w-full mb-3 border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-gray-50 text-gray-700">
              {signerName || <span className="text-gray-400">No team assigned</span>}
            </div>
            <p className="text-sm font-medium text-gray-700 mb-2">Technician signature</p>
            {showTechPad ? (
              <>
                <div className="border border-gray-300 rounded-xl overflow-hidden bg-white" style={{ height: 140 }}>
                  <canvas ref={techCanvasRef} className="w-full h-full touch-none select-none block"
                    style={{ touchAction: "none" }} />
                </div>
                <button
                  onClick={() => techPad.current?.clear()}
                  className="mt-1.5 text-xs text-gray-400 hover:text-red-500 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              </>
            ) : (
              <div className="border border-gray-300 rounded-xl overflow-hidden bg-white" style={{ height: 140 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={savedTechSig} alt="Technician signature" className="w-full h-full object-contain" />
              </div>
            )}
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Client name</p>
            <div className="w-full border border-gray-200 bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-700">
              {task.customer.name || task.customer.phone || "Customer"}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Client signature</p>
            {showClientPad ? (
              <>
                <div className="border border-gray-300 rounded-xl overflow-hidden bg-white" style={{ height: 140 }}>
                  <canvas ref={clientCanvasRef} className="w-full h-full touch-none select-none block"
                    style={{ touchAction: "none" }} />
                </div>
                <button
                  onClick={() => clientPad.current?.clear()}
                  className="mt-1.5 text-xs text-gray-400 hover:text-red-500 flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              </>
            ) : (
              <div className="border border-gray-300 rounded-xl overflow-hidden bg-white" style={{ height: 140 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={savedClientSig} alt="Client signature" className="w-full h-full object-contain" />
              </div>
            )}
          </div>

          {/* Once submitted, the report is locked — no edit/submit here; checkout from the card below. */}
          {!reportSubmitted && (
            <button
              onClick={handleSubmitReport}
              disabled={submitLoading}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-medium py-3 rounded-xl transition-colors"
            >
              {submitLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {submitLoading ? "Submitting report…" : "Submit & Complete Job"}
            </button>
          )}
        </div>
      )}

      {reportSubmitted && !isCheckedOut && (
        <div className="bg-white rounded-xl border border-green-200 p-5 space-y-5">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="mt-3 text-lg font-semibold text-gray-900">Report Submitted</h2>
            <p className="text-sm text-gray-500 mt-1">Checkout to finish the job before generating the PDF report.</p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleCheckout}
              disabled={checkoutLoading}
              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-medium px-5 py-2.5 rounded-xl transition-colors whitespace-nowrap"
            >
              {checkoutLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
              {checkoutLoading ? "Checking out…" : "Checkout"}
            </button>
          </div>
        </div>
      )}

      {/* ─── Done ─── */}
      {isDone && (
        <div className="bg-white rounded-xl border border-green-200 p-6 text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Job Complete!</h2>
            <p className="text-sm text-gray-500 mt-1">
              {task.report?.pdfUrl || doneResult?.pdfUrl
                ? "The report has been submitted and the customer has been notified."
                : "Saved on this device. The PDF and customer notification will be created automatically after sync."}
            </p>
          </div>

          {(doneResult?.pdfUrl || task.report?.pdfUrl) && (
            <button
              type="button"
              onClick={() => {
                const url = doneResult?.pdfUrl ?? task.report?.pdfUrl ?? "";
                void openPdf(url, doneResult?.whatsappLink ?? reportWhatsappLink(url, task.customer.phone));
              }}
              disabled={pdfOpenPending}
              className="w-full flex items-center justify-center gap-2 bg-[#151513] hover:bg-[#26251f] disabled:bg-[#151513]/50 text-white font-medium px-5 py-2.5 rounded-xl transition-colors whitespace-nowrap"
            >
              {pdfOpenPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {pdfOpenPending ? "Preparing PDF" : "View PDF Report"}
            </button>
          )}
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
            <div className="flex min-w-0 items-center justify-end gap-2">
              {/* Reliable on desktop: download the file, then attach it in WhatsApp manually. */}
              <button
                type="button"
                onClick={handlePdfDownload}
                disabled={pdfDownloadPending}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-gray-100 px-3 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {pdfDownloadPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {pdfDownloadPending ? "Preparing PDF" : "Download"}
              </button>
              <a
                href={pdfViewer.whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700"
              >
                <MessageCircle className="h-4 w-4" />
                Send to Client
              </a>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto bg-gray-200">
            <div
              className="min-h-full"
              style={compactPdfViewer ? { width: "138.8889%", transform: "scale(0.72)", transformOrigin: "top left" } : undefined}
            >
              <iframe
                title="PDF Report"
                // Mobile/PWA viewers need both page-width zooming and outer scaling to keep the whole PDF visible.
                src={`${pdfViewer.viewUrl}#toolbar=0&navpanes=0&zoom=page-width&view=FitH`}
                className="min-h-0 w-full bg-gray-200"
                style={{ height: "calc(100dvh - 57px)" }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
