import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const taskDetailSource = readFileSync(new URL("./TaskDetailClient.tsx", import.meta.url), "utf8");
const startRouteSource = readFileSync(new URL("../../app/api/tasks/[id]/start/route.ts", import.meta.url), "utf8");
const checkInRouteSource = readFileSync(new URL("../../app/api/tasks/[id]/checkin/route.ts", import.meta.url), "utf8");
const photoRouteSource = readFileSync(new URL("../../app/api/tasks/[id]/photo/route.ts", import.meta.url), "utf8");
const taskRouteSource = readFileSync(new URL("../../app/api/tasks/[id]/route.ts", import.meta.url), "utf8");

test("task starts from overview before moving to check-in", () => {
  assert.match(taskDetailSource, /if \(task\.status === "COMING_SOON"\) return 0/);
  assert.match(taskDetailSource, /const startStageVisible = !hasStarted && !isDone/);
  assert.match(taskDetailSource, /const checkInStepVisible = hasStarted \|\| isDone/);
  assert.match(taskDetailSource, /const hasStarted = task\.status !== "COMING_SOON"/);
  assert.match(taskDetailSource, /const handleStartTask = async \(\) =>/);
  assert.match(taskDetailSource, /submitOfflineRequest\(\{[\s\S]*action: "start",[\s\S]*url: `\/api\/tasks\/\$\{taskId\}\/start`/);
  assert.match(taskDetailSource, /\{startStageVisible && \(/);
  assert.match(taskDetailSource, /\{checkInStepVisible && \(/);
  assert.match(taskDetailSource, /Start Task/);
  assert.match(taskDetailSource, /bg-red-600 hover:bg-red-700/);
});

test("sub job task detail can preview the previous appointment details", () => {
  assert.match(taskRouteSource, /parent: \{/);
  assert.match(taskRouteSource, /function serializePreviousAppointment/);
  assert.match(taskDetailSource, /previousAppointment\?: PreviousAppointment \| null/);
  assert.match(taskDetailSource, /const \[previousPreviewOpen, setPreviousPreviewOpen\] = useState\(false\)/);
  assert.match(taskDetailSource, /Previous Details/);
  assert.match(taskDetailSource, /setPreviousPreviewOpen\(true\)/);
  assert.match(taskDetailSource, /Previous Appointment Details/);
  assert.match(taskDetailSource, /setPreviousPreviewOpen\(false\)/);
  assert.match(taskDetailSource, /previousAppointment\.servicePhotos\.filter\(\(photo\) => photo\.type === "EVIDENCE"\)/);
});

test("gps check-in lives inside each work location before attendance selfie", () => {
  assert.match(taskDetailSource, /function locationKey\(loc: WorkLocationGroup, locIdx: number\)/);
  assert.match(taskDetailSource, /workLocations\.map\(\(loc, locIdx\) =>/);
  assert.match(taskDetailSource, /const getLocationCheckIn = \(loc: WorkLocationGroup\)/);
  assert.match(taskDetailSource, /const getLocationAttendancePhoto = \(loc: WorkLocationGroup\)/);
  assert.match(taskDetailSource, /const activeUnsettledLocationId = workLocations\.map\(\(loc, locIdx\) =>/);
  assert.match(taskDetailSource, /handleCheckIn\(loc, locIdx\)/);
  assert.match(taskDetailSource, /GPS Check-In/);
  assert.match(taskDetailSource, /bg-green-600 hover:bg-green-700/);
  assert.match(taskDetailSource, /disabled=\{!canLocationCheckIn \|\| gpsLoadingKey === locationId\}/);
  assert.match(taskDetailSource, /Take Attendance Selfie/);
  assert.match(taskDetailSource, /openAttendanceCamera\(loc\)/);
  assert.match(taskDetailSource, /Attendance selfie recorded/);
  assert.match(taskDetailSource, /Please complete the checked-in location before starting another address/);
  assert.doesNotMatch(taskDetailSource, /attendancePhotos\.length === 0 \? \(/);
  assert.doesNotMatch(taskDetailSource, /hasStarted && attendancePhotos\.length > 0 && !hasCheckedIn/);
  assert.doesNotMatch(taskDetailSource, />Check In Now</);
});

test("attendance selfie is tied to the selected work location", () => {
  assert.match(taskDetailSource, /function getLocationAssetIds\(loc: WorkLocationGroup\)/);
  assert.match(taskDetailSource, /const pendingAttendanceLocation = useRef<WorkLocationGroup \| null>\(null\)/);
  assert.match(taskDetailSource, /pendingAttendanceLocation\.current = location/);
  assert.match(taskDetailSource, /const attendanceAssetId = pending\?\.type === "ATTENDANCE" && pendingAttendanceLocation\.current/);
  assert.match(taskDetailSource, /const type = pending\?\.type \?\? "ATTENDANCE"/);
  assert.match(taskDetailSource, /await uploadPhotoFile\(file, type, assetId, pending\?\.photoId\)/);
});

test("evidence photos live inside each checked-in address and require at least three live snaps per asset, with extra photos allowed", () => {
  assert.match(taskDetailSource, /const getAssetEvidencePhotos = \(assetId: string\)/);
  assert.match(taskDetailSource, /const locationEvidenceComplete = \(loc: WorkLocationGroup\)/);
  assert.match(taskDetailSource, /locationEvidenceComplete\(loc\)/);
  assert.match(taskDetailSource, /const requiredEvidencePhotos = Math\.max\(3, minEvidencePhotos\)/);
  assert.match(taskDetailSource, /getAssetEvidencePhotos\(asset\.id\)\.length >= evidenceRequirementForAsset\(asset, fallbackEvidencePhotos\)/);
  assert.match(taskDetailSource, />\s*Asset Type\s*</);
  assert.match(taskDetailSource, />\s*Job Category\s*</);
  assert.match(taskDetailSource, />\s*Property Type\s*</);
  assert.match(taskDetailSource, />\s*Work Progress Photos\s*</);
  assert.match(taskDetailSource, /const requiredPhotoSlots = Math\.max\(requiredEvidencePhotos, assetPhotos\.length\)/);
  assert.match(taskDetailSource, /Array\.from\(\{ length: requiredPhotoSlots \}/);
  assert.match(taskDetailSource, /\{photo\?\.label \|\| `Photo \$\{index \+ 1\}`\}/);
  assert.match(taskDetailSource, /\{assetPhotos\.length\}\/\{requiredEvidencePhotos\} photos/);
  assert.match(taskDetailSource, /assetPhotos\.length >= requiredEvidencePhotos && assetControlsVisible/);
  assert.match(taskDetailSource, />Add Photo</);
  assert.match(taskDetailSource, /onClick=\{\(\) => openEvidenceCamera\(asset\.id\)\}/);
  assert.match(taskDetailSource, /const openEvidenceCamera = async \(assetId: string\) =>/);
  assert.match(taskDetailSource, /pendingPhoto\.current = \{ type: "EVIDENCE", assetId \}/);
  assert.match(taskDetailSource, /Take live photo/);
  assert.doesNotMatch(taskDetailSource, /<h2 className="font-semibold text-gray-900">Photos<\/h2>/);
  assert.doesNotMatch(taskDetailSource, /onClick=\{\(\) => openCamera\("EVIDENCE"/);
});

test("evidence photo requirement follows each asset job category template", () => {
  assert.match(taskDetailSource, /minEvidencePhotos\?: number \| null/);
  assert.match(taskDetailSource, /function evidenceRequirementForAsset\(asset: Pick<Asset, "jobCategory">, fallback: number\)/);
  assert.match(taskDetailSource, /Math\.max\(3, Number\(asset\.jobCategory\?\.minEvidencePhotos \?\? fallback\)\)/);
  assert.match(taskDetailSource, /const fallbackEvidencePhotos = Math\.max\(3, minEvidencePhotos\)/);
  assert.match(taskDetailSource, /const currentStep = deriveStep\(task, fallbackEvidencePhotos\)/);
  assert.match(taskDetailSource, /const requiredEvidencePhotos = evidenceRequirementForAsset\(asset, fallbackEvidencePhotos\)/);
  assert.match(taskDetailSource, /getAssetEvidencePhotos\(asset\.id\)\.length >= evidenceRequirementForAsset\(asset, fallbackEvidencePhotos\)/);
});

test("evidence photos require a technician label before upload and show that label after saving", () => {
  assert.match(taskDetailSource, /interface ServicePhoto \{ id: string; photoUrl: string; type: string; assetId\?: string \| null; label\?: string \| null; createdAt: string \}/);
  assert.match(taskDetailSource, /const \[photoLabel, setPhotoLabel\] = useState\(""\)/);
  assert.match(taskDetailSource, /pendingPhoto\.current = \{ type: "EVIDENCE", assetId \}/);
  assert.match(taskDetailSource, /setPhotoLabel\(""\)/);
  assert.match(taskDetailSource, /const label = type === "EVIDENCE" \? photoLabel\.trim\(\) : ""/);
  assert.match(taskDetailSource, /if \(type === "EVIDENCE" && !label\)/);
  assert.match(taskDetailSource, /form\.append\("label", label\)/);
  assert.match(taskDetailSource, /\{photo\?\.label \|\| `Photo \$\{index \+ 1\}`\}/);
  assert.match(photoRouteSource, /const label = \(form\.get\("label"\) as string \| null\)\?\.trim\(\) \?\? ""/);
  assert.match(photoRouteSource, /if \(type === "EVIDENCE" && !label\)/);
  assert.match(photoRouteSource, /label,/);
});

test("uploaded evidence photos can be opened to edit the photo name or retake the same photo", () => {
  assert.match(taskDetailSource, /const \[editingPhoto, setEditingPhoto\] = useState<ServicePhoto \| null>\(null\)/);
  assert.match(taskDetailSource, /const \[editingPhotoLabel, setEditingPhotoLabel\] = useState\(""\)/);
  assert.match(taskDetailSource, /const openEditPhoto = \(photo: ServicePhoto\) =>/);
  assert.match(taskDetailSource, /const handleSavePhotoEdit = async \(\) =>/);
  assert.match(taskDetailSource, /action: "photo-update",[\s\S]*url: `\/api\/tasks\/\$\{taskId\}\/photo`,[\s\S]*method: "PATCH",[\s\S]*json: \{ photoId: editingPhoto\.id, label \}/);
  assert.match(taskDetailSource, /const openRetakeEvidencePhoto = async \(photo: ServicePhoto\) =>/);
  assert.match(taskDetailSource, /pendingPhoto\.current = \{ type: "EVIDENCE", assetId: photo\.assetId \?\? undefined, photoId: photo\.id \}/);
  assert.match(taskDetailSource, /await uploadPhotoFile\(file, type, assetId, pending\?\.photoId\)/);
  assert.match(taskDetailSource, /form\.append\("photoId", replacePhotoId\)/);
  assert.match(taskDetailSource, /onEdit=\{openEditPhoto\}/);
  assert.match(taskDetailSource, /Edit Work Progress Photo/);
  assert.match(taskDetailSource, /Retake Photo/);
  assert.match(taskDetailSource, /Save Changes/);
  assert.match(photoRouteSource, /export async function PATCH/);
  assert.match(photoRouteSource, /const isMultipart = req\.headers\.get\("content-type"\)\?\.includes\("multipart\/form-data"\)/);
  assert.match(photoRouteSource, /const photoId = isMultipart \? form\.get\("photoId"\) as string \| null : body\.photoId/);
  assert.match(photoRouteSource, /prisma\.servicePhoto\.update/);
  assert.match(photoRouteSource, /await unlink\(path\.join\(uploadDir, path\.basename\(photo\.photoUrl\)\)\)\.catch\(\(\) => undefined\)/);
});

test("editing or retaking a work progress photo keeps it in its original position", () => {
  assert.match(taskDetailSource, /interface ServicePhoto \{ id: string; photoUrl: string; type: string; assetId\?: string \| null; label\?: string \| null; createdAt: string \}/);
  assert.match(taskDetailSource, /function sortServicePhotos\(photos: ServicePhoto\[\]\)/);
  assert.match(taskDetailSource, /new Date\(a\.createdAt\)\.getTime\(\) - new Date\(b\.createdAt\)\.getTime\(\)/);
  assert.match(taskDetailSource, /const orderedServicePhotos = sortServicePhotos\(task\.servicePhotos\)/);
  assert.match(taskDetailSource, /const attendancePhotos = orderedServicePhotos\.filter\(\(p\) => p\.type === "ATTENDANCE"\)/);
  assert.match(taskDetailSource, /const evidencePhotos = orderedServicePhotos\.filter\(\(p\) => p\.type === "EVIDENCE"\)/);
  assert.match(taskRouteSource, /servicePhotos: \{ orderBy: \{ createdAt: "asc" \} \}/);
});

test("mobile stays anchored on the current asset after adding or retaking a work progress photo", () => {
  assert.match(taskDetailSource, /const assetPhotoSectionRefs = useRef<Record<string, HTMLDivElement \| null>>\(\{\}\)/);
  assert.match(taskDetailSource, /function scrollAssetPhotosIntoView\(assetId\?: string\)/);
  assert.match(taskDetailSource, /window\.innerWidth >= 768/);
  assert.match(taskDetailSource, /assetPhotoSectionRefs\.current\[assetId\]\?\.scrollIntoView\(\{\s*behavior: "auto",\s*block: "nearest",\s*inline: "nearest",\s*\}\)/);
  assert.match(taskDetailSource, /if \(type === "EVIDENCE"\) scrollAssetPhotosIntoView\(assetId\)/);
  assert.match(taskDetailSource, /ref=\{\(node\) => \{\s*assetPhotoSectionRefs\.current\[asset\.id\] = node;\s*\}\}/);
});

test("assets stay hidden until an attendance selfie has been recorded", () => {
  assert.match(taskDetailSource, /const attendancePhotos = orderedServicePhotos\.filter\(\(p\) => p\.type === "ATTENDANCE"\)/);
  assert.match(taskDetailSource, /const assetStepVisible = attendancePhotos\.length > 0 \|\| paymentStepVisible \|\| hasPayment \|\| isDone/);
  assert.match(taskDetailSource, /\{assetStepVisible && \(/);
  assert.doesNotMatch(taskDetailSource, /const assetStepVisible = hasCheckedIn \|\| paymentStepVisible \|\| hasPayment \|\| isDone/);
});

test("each asset has an optional technician remark field after its evidence photos", () => {
  assert.match(taskDetailSource, /const \[assetRemarks, setAssetRemarks\] = useState<Record<string, string>>\(\{\}\)/);
  assert.match(taskDetailSource, /technicianRemark\?: string \| null/);
  assert.match(taskDetailSource, /\[asset\.id, asset\.technicianRemark \?\? ""\]/);
  assert.doesNotMatch(taskDetailSource, /\[asset\.id, asset\.remarks \?\? ""\]/);
  assert.match(taskDetailSource, /const assetStepVisible = attendancePhotos\.length > 0 \|\| paymentStepVisible \|\| hasPayment \|\| isDone/);
  assert.match(taskDetailSource, /const assetEditingLocked = paymentStepVisible \|\| nextLoading \|\| isDone/);
  assert.match(taskDetailSource, /const assetControlsVisible = !!locationAttendancePhoto && !assetEditingLocked/);
  assert.match(taskDetailSource, /const technicianRemarkValue = assetRemarks\[asset\.id\] \?\? ""/);
  assert.match(taskDetailSource, /\{assetStepVisible && \(/);
  assert.match(taskDetailSource, /const saveAssetRemarks = useCallback\(async \(\) =>/);
  assert.match(taskDetailSource, /const handleNext = async \(\) =>/);
  assert.match(taskDetailSource, /await saveAssetRemarks\(\)/);
  assert.match(taskDetailSource, /action: "remark",[\s\S]*url: `\/api\/tasks\/\$\{taskId\}`,[\s\S]*method: "PATCH"/);
  assert.match(taskDetailSource, /json: \{ assetId: asset\.id, technicianRemark \}/);
  assert.match(taskDetailSource, /\{asset\.remarks \|\| "-"\}/);
  assert.match(taskDetailSource, /<label htmlFor=\{`remark-\$\{asset\.id\}`\}/);
  assert.match(taskDetailSource, />\s*Remark <span className="font-normal text-gray-400">\(optional\)<\/span>\s*</);
  assert.match(taskDetailSource, /id=\{`remark-\$\{asset\.id\}`\}/);
  assert.match(taskDetailSource, /value=\{assetRemarks\[asset\.id\] \?\? ""\}/);
  assert.match(taskDetailSource, /disabled=\{reportSubmitted \|\| isDone\}/);
  assert.match(taskDetailSource, /onClick=\{handleNext\}/);
  assert.match(taskDetailSource, /\{assetControlsVisible \? \(/);
  assert.match(taskDetailSource, /Technician Remark/);
  assert.doesNotMatch(taskDetailSource, /Save Remark/);
  assert.match(taskRouteSource, /export async function PATCH/);
  assert.match(taskRouteSource, /const \{ assetId, technicianRemark \} = await req\.json\(\)/);
  assert.match(taskRouteSource, /const nextRemark = typeof technicianRemark === "string" && technicianRemark\.trim\(\)/);
  assert.match(taskRouteSource, /if \(appt\.clockOutAt\)/);
  assert.match(taskRouteSource, /capturedDate\(req\.headers\.get\("X-Offline-Captured-At"\)\)/);
  assert.match(taskRouteSource, /const capturedBeforeCheckout = capturedAt\.getTime\(\) <= appt\.clockOutAt\.getTime\(\)/);
  assert.match(taskRouteSource, /if \(asset\.technicianRemark && asset\.technicianRemark !== nextRemark\)/);
});

test("technician remarks auto-save without waiting for task completion", () => {
  assert.match(taskDetailSource, /const assetRemarksRef = useRef<Record<string, string>>\(\{\}\)/);
  assert.match(taskDetailSource, /const assetRemarkSaveChainsRef = useRef<Map<string, Promise<void>>>\(new Map\(\)\)/);
  assert.match(taskDetailSource, /const saveAssetRemark = useCallback\(async \(asset: Asset\) =>/);
  assert.match(taskDetailSource, /const previousSave = assetRemarkSaveChainsRef\.current\.get\(asset\.id\) \?\? Promise\.resolve\(\)/);
  assert.match(taskDetailSource, /if \(\(assetRemarksRef\.current\[asset\.id\] \?\? ""\) === technicianRemark\)/);
  assert.match(taskDetailSource, /window\.setTimeout\(\(\) => \{[\s\S]*saveAssetRemarks\(\)[\s\S]*\}, 800\)/);
  assert.match(taskDetailSource, /onBlur=\{\(\) => \{[\s\S]*saveAssetRemark\(asset\)/);
});

test("task detail reload always fetches the latest task data after remark saves", () => {
  assert.match(taskDetailSource, /fetch\(`\/api\/tasks\/\$\{taskId\}`, \{ cache: "no-store" \}\)/);
});

test("live refresh accepts teammate remarks while preserving only local dirty or queued drafts", () => {
  assert.match(taskDetailSource, /function buildAssetRemarkDrafts\(assets: Asset\[\]\)/);
  assert.match(taskDetailSource, /function mergeAssetRemarkDrafts\([\s\S]*dirtyAssetIds: ReadonlySet<string>[\s\S]*queuedDrafts: Record<string, string>/);
  assert.match(taskDetailSource, /if \(dirtyAssetIds\.has\(assetId\) && currentDrafts\[assetId\] !== undefined\)/);
  assert.match(taskDetailSource, /else if \(queuedDrafts\[assetId\] !== undefined\)/);
  assert.match(taskDetailSource, /dirtyAssetRemarkIdsRef = useRef<Set<string>>\(new Set\(\)\)/);
  assert.match(taskDetailSource, /queuedAssetRemarkDraftsRef = useRef<Record<string, string>>\(\{\}\)/);
  assert.match(taskDetailSource, /getPendingQueueForTask\(taskId\)/);
  assert.match(taskDetailSource, /dirtyAssetRemarkIdsRef\.current\.add\(asset\.id\)/);
  assert.match(taskDetailSource, /const dirtyAssets = task\.assets\.filter\(\(asset\) => dirtyAssetRemarkIdsRef\.current\.has\(asset\.id\)\)/);
  assert.match(taskDetailSource, /const merged = mergeAssetRemarkDrafts\([\s\S]*dirtyAssetRemarkIdsRef\.current,[\s\S]*queuedAssetRemarkDraftsRef\.current/);
  assert.match(taskDetailSource, /assetRemarksRef\.current = merged/);
});

test("next button unlocks payment only after every location and photo requirement is complete", () => {
  assert.match(taskDetailSource, /const \[showPaymentStep, setShowPaymentStep\] = useState\(false\)/);
  assert.match(taskDetailSource, /const \[nextLoading, setNextLoading\] = useState\(false\)/);
  assert.match(taskDetailSource, /const canGoNext = hasStarted && hasEnoughPhotos && !isDone/);
  assert.match(taskDetailSource, /const paymentStepVisible = paymentRequired && \(hasPayment \|\| showPaymentStep\)/);
  assert.match(taskDetailSource, /const signatureStepVisible = \(hasPayment \|\| \(isFullyFoc && hasEnoughPhotos\)\) && !isDone && !repairSelectionActive/);
  assert.match(taskDetailSource, /const assetEditingLocked = paymentStepVisible \|\| nextLoading \|\| isDone/);
  assert.match(taskDetailSource, /const urgentStepVisible = paymentStepVisible && !isDone/);
  assert.match(taskDetailSource, /onClick=\{handleNext\}/);
  assert.match(taskDetailSource, /disabled=\{!canGoNext \|\| nextLoading\}/);
  assert.match(taskDetailSource, /bg-red-600 hover:bg-red-700 disabled:bg-gray-300 disabled:text-gray-500 text-white/);
  assert.match(taskDetailSource, /\{nextLoading \? "Saving\.\.\." : "Next"\}/);
  assert.match(taskDetailSource, /setShowPaymentStep\(true\);\s*try \{\s*await saveAssetRemarks\(\);\s*await loadTask\(true\);/);
  assert.match(taskDetailSource, /\{paymentStepVisible && !isDone && \(/);
  assert.match(taskDetailSource, /\{urgentStepVisible && \(/);
  assert.doesNotMatch(taskDetailSource, /\{hasEnoughPhotos && !isDone && \(/);
});

test("continue repair picker pauses FOC and signature sections until a work item is chosen", () => {
  assert.match(taskDetailSource, /const repairSelectionActive = showTroubleshootDecision/);
  assert.doesNotMatch(taskDetailSource, /const repairSelectionActive = continueRepairOpen && showTroubleshootDecision/);
  assert.match(taskDetailSource, /const repairPickerRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(taskDetailSource, /const repairDecisionBoundaryRef = useRef<HTMLDivElement>\(null\)/);
  assert.match(taskDetailSource, /if \(!continueRepairOpen\) return/);
  assert.match(taskDetailSource, /repairPickerRef\.current\?\.scrollIntoView\(\{\s*behavior: "auto",\s*block: "nearest",\s*inline: "nearest",\s*\}\)/);
  assert.match(taskDetailSource, /\}, \[continueRepairOpen\]\)/);
  assert.doesNotMatch(taskDetailSource, /\}, \[continueRepairOpen, newWorkCategoryId, newWorkBillingType\]\)/);
  assert.match(taskDetailSource, /ref=\{repairPickerRef\}/);
  assert.match(taskDetailSource, /ref=\{repairDecisionBoundaryRef\}/);
  assert.match(taskDetailSource, /function clampRepairSelectionScroll\(\)/);
  assert.match(taskDetailSource, /taskRootRef\.current\?\.closest\("main"\)/);
  assert.match(taskDetailSource, /const boundary = repairPickerRef\.current \?\? repairDecisionBoundaryRef\.current/);
  assert.match(taskDetailSource, /if \(scrollContainer\.scrollTop > maxScroll\) scrollContainer\.scrollTop = maxScroll/);
  assert.match(taskDetailSource, /scrollContainer\.addEventListener\("scroll", scheduleClamp, \{ passive: true \}\)/);
  assert.doesNotMatch(taskDetailSource, /repairPickerMinHeight/);
  assert.doesNotMatch(taskDetailSource, /updateRepairPickerHeight/);
  assert.doesNotMatch(taskDetailSource, /max-md:-mb-\[calc\(4rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(taskDetailSource, /const focNoticeVisible = isFullyFoc && hasEnoughPhotos && !isDone && !repairSelectionActive/);
  assert.match(taskDetailSource, /const signatureStepVisible = \(hasPayment \|\| \(isFullyFoc && hasEnoughPhotos\)\) && !isDone && !repairSelectionActive/);
  assert.match(taskDetailSource, /\{focNoticeVisible && \(/);
  assert.doesNotMatch(taskDetailSource, /\{isFullyFoc && hasEnoughPhotos && !isDone && \(/);
});

test("adding a troubleshoot work item keeps mobile anchored on the new work item", () => {
  assert.match(taskDetailSource, /const createdAssetId = typeof data\.id === "string" \? data\.id : ""/);
  assert.match(taskDetailSource, /await loadTask\(true\);\s*if \(createdAssetId\) scrollAssetPhotosIntoView\(createdAssetId\);/);
});

test("troubleshoot assets stay above added repair work items", () => {
  assert.match(taskDetailSource, /function sortTaskAssetsForDisplay\(assets: Asset\[\]\)/);
  assert.match(taskDetailSource, /Number\(Boolean\(b\.isTroubleshoot \|\| isTroubleshootCategoryName\(b\.jobCategory\?\.name\)\)\)/);
  assert.match(taskDetailSource, /for \(const asset of sortTaskAssetsForDisplay\(task\.assets\)\)/);
});

test("payment-step scroll hook stays before loading and task early returns", () => {
  const scrollGuardIndex = taskDetailSource.indexOf("if (!paymentStepScrollVisible) return;");
  const loadingReturnIndex = taskDetailSource.indexOf("if (loading) {");
  const taskReturnIndex = taskDetailSource.indexOf("if (!task) {");

  assert.notEqual(scrollGuardIndex, -1);
  assert.notEqual(loadingReturnIndex, -1);
  assert.notEqual(taskReturnIndex, -1);
  assert.ok(scrollGuardIndex < loadingReturnIndex);
  assert.ok(scrollGuardIndex < taskReturnIndex);
  assert.match(taskDetailSource, /useEffect\(\(\) => \{\s*if \(!paymentStepScrollVisible\) return;/);
  assert.match(taskDetailSource, /const paymentStepScrollVisible = !!task && taskChargeableTotalForEffects > 0 && \(\!\!task\.payments\[0\] \|\| showPaymentStep\) && !task\.clockOutAt/);
});

test("signature pads initialize whenever the signature section is available", () => {
  assert.match(taskDetailSource, /const signaturePadsVisible =/);
  assert.match(taskDetailSource, /if \(!signaturePadsVisible \|\| isCheckedOutForPads\) return/);
  assert.doesNotMatch(taskDetailSource, /if \(!paymentRecorded \|\| isCheckedOutForPads\) return/);
  assert.match(taskDetailSource, /const techPadCanvas = useRef<HTMLCanvasElement \| null>\(null\)/);
  assert.match(taskDetailSource, /const clientPadCanvas = useRef<HTMLCanvasElement \| null>\(null\)/);
  assert.match(taskDetailSource, /techPadCanvas\.current !== techCanvas/);
  assert.match(taskDetailSource, /clientPadCanvas\.current !== clientCanvas/);
  assert.match(taskDetailSource, /typeof ResizeObserver !== "undefined"/);
});

test("payment gates signatures by method and approval status", () => {
  assert.match(taskDetailSource, /const approvedPayment = task\.payments\.find\(\(payment\) => payment\.status === "APPROVED"\) \?\? null/);
  assert.match(taskDetailSource, /const latestPayment = task\.payments\[0\] \?\? null/);
  assert.match(taskDetailSource, /const hasApprovedPayment = !!approvedPayment/);
  // Cash & QR/Transfer both require a live receipt photo; only Pay Office is exempt.
  assert.match(taskDetailSource, /const canSubmitPayment = payMethod === "OFFICE" \|\| !!receiptFile/);
  assert.match(taskDetailSource, /if \(payMethod !== "OFFICE" && !receiptFile\)/);
  assert.match(taskDetailSource, /const openReceiptCamera = async \(\) =>/);
  assert.match(taskDetailSource, /setLivePhotoType\("RECEIPT"\)/);
  assert.match(taskDetailSource, /applyReceiptFile\(file\)/);
  assert.match(taskDetailSource, /onClick=\{openReceiptCamera\}/);
  assert.match(taskDetailSource, /disabled=\{payLoading \|\| !canSubmitPayment\}/);
  assert.match(taskDetailSource, /Please take a live receipt photo before confirming payment/);
  assert.match(taskDetailSource, /QR \/ Transfer payment is waiting for admin approval/);
  // Signatures now unlock once any payment is recorded; warranty jobs skip
  // payment and unlock signatures after the photo requirement is complete.
  assert.match(taskDetailSource, /if \(task\.payments\.length > 0\) return 4/);
  assert.match(taskDetailSource, /\{signatureStepVisible && \(/);
  assert.doesNotMatch(taskDetailSource, /\{hasApprovedPayment && !isDone && \(/);
});

test("check-in validates selected location within 200m", () => {
  assert.match(taskDetailSource, /disabled=\{!canLocationCheckIn \|\| gpsLoadingKey === locationId\}/);
  assert.match(taskDetailSource, /geofenceRadius = 200/);
  assert.match(checkInRouteSource, /process\.env\.GEOFENCE_RADIUS_METERS \?\? 200/);
});

test("gps errors render below the selected check-in button as plain red text", () => {
  assert.match(taskDetailSource, /const \[gpsErrorKey, setGpsErrorKey\] = useState\(""\)/);
  assert.match(taskDetailSource, /setGpsErrorKey\(locationId\)/);
  assert.match(taskDetailSource, /\{gpsError && gpsErrorKey === locationId && \(/);
  assert.match(taskDetailSource, /<p className="text-xs text-red-600">\s*\{gpsError\}\s*<\/p>/);
  assert.doesNotMatch(taskDetailSource, /bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm/);
});

test("gps check-in reports actionable browser location failures instead of generic location error", () => {
  assert.match(taskDetailSource, /function geolocationErrorMessage\(err: unknown\)/);
  assert.match(taskDetailSource, /case 1:/);
  assert.match(taskDetailSource, /Location permission is blocked/);
  assert.match(taskDetailSource, /case 2:/);
  assert.match(taskDetailSource, /Could not detect your GPS location/);
  assert.match(taskDetailSource, /case 3:/);
  assert.match(taskDetailSource, /GPS took too long/);
  assert.match(taskDetailSource, /const CHECK_IN_GPS_OPTIONS: PositionOptions\[\] =/);
  assert.match(taskDetailSource, /This work location has no GPS pin/);
  assert.doesNotMatch(taskDetailSource, /err instanceof Error \? err\.message : "Location error"/);
});

test("gps check-in falls back to a recent network location when precise GPS is slow", () => {
  assert.match(taskDetailSource, /const CHECK_IN_GPS_OPTIONS: PositionOptions\[\] =/);
  assert.match(taskDetailSource, /enableHighAccuracy: true,\s*timeout: 30000,\s*maximumAge: 10000/);
  assert.match(taskDetailSource, /enableHighAccuracy: false,\s*timeout: 25000,\s*maximumAge: 60000/);
  assert.match(taskDetailSource, /function getBrowserPosition\(options: PositionOptions\)/);
  assert.match(taskDetailSource, /async function getCheckInPosition\(\)/);
  assert.match(taskDetailSource, /for \(const options of CHECK_IN_GPS_OPTIONS\)/);
  assert.match(taskDetailSource, /isPermissionDenied\(err\)/);
  assert.match(taskDetailSource, /const pos = await getCheckInPosition\(\)/);
  assert.doesNotMatch(taskDetailSource, /navigator\.geolocation\.getCurrentPosition\(resolve, reject, \{\s*enableHighAccuracy: true,\s*timeout: 20000,\s*maximumAge: 0,\s*\}\)/);
});

test("attendance selfie uses a live camera stream instead of gallery file input", () => {
  assert.match(taskDetailSource, /const attendanceVideoRef = useRef<HTMLVideoElement>\(null\)/);
  assert.match(taskDetailSource, /navigator\.mediaDevices\.getUserMedia\(\{\s*video: \{ facingMode: "user" \},\s*audio: false,\s*\}\)/);
  assert.match(taskDetailSource, /function stopAttendanceCamera\(\)/);
  assert.match(taskDetailSource, /const captureAttendanceSelfie = async \(\) =>/);
  assert.match(taskDetailSource, /canvas\.toBlob/);
  assert.match(taskDetailSource, /await uploadPhotoFile\(file, type, assetId, pending\?\.photoId\)/);
  assert.match(taskDetailSource, /<video[\s\S]*ref=\{attendanceVideoRef\}/);
  assert.match(taskDetailSource, /Capture Selfie/);
  assert.doesNotMatch(taskDetailSource, /setCameraCapture\(type === "ATTENDANCE"/);
  assert.doesNotMatch(taskDetailSource, /openCamera\("ATTENDANCE"\)/);
});

test("live photo capture ignores repeated taps while capture or upload is still running", () => {
  assert.match(taskDetailSource, /const photoCaptureInFlightRef = useRef\(false\)/);
  assert.match(taskDetailSource, /const photoUploadInFlightRef = useRef\(false\)/);
  assert.match(taskDetailSource, /if \(photoUploadInFlightRef\.current\) return/);
  assert.match(taskDetailSource, /photoUploadInFlightRef\.current = true/);
  assert.match(taskDetailSource, /photoUploadInFlightRef\.current = false/);
  assert.match(taskDetailSource, /if \(photoCaptureInFlightRef\.current \|\| photoUploadInFlightRef\.current\) return/);
  assert.match(taskDetailSource, /photoCaptureInFlightRef\.current = true/);
  assert.match(taskDetailSource, /photoCaptureInFlightRef\.current = false/);
  assert.match(taskDetailSource, /setPhotoUploading\(true\);\s*try \{\s*const video = attendanceVideoRef\.current/);
});

test("saved attendance and evidence photos can be deleted so they can be retaken", () => {
  assert.match(taskDetailSource, /const \[deletingPhotoId, setDeletingPhotoId\] = useState\(""\)/);
  assert.match(taskDetailSource, /const handleDeletePhoto = async \(photoId: string\) =>/);
  assert.match(taskDetailSource, /action: "photo-delete",[\s\S]*url: `\/api\/tasks\/\$\{taskId\}\/photo`,[\s\S]*method: "DELETE"/);
  assert.match(taskDetailSource, /<PhotoThumbnail/);
  assert.match(taskDetailSource, /onDelete=\{handleDeletePhoto\}/);
  assert.match(taskDetailSource, /aria-label=\{`Delete \$\{alt\}`\}/);
  assert.match(photoRouteSource, /export async function DELETE/);
  assert.match(photoRouteSource, /const \{ photoId \} = await req\.json\(\)/);
  assert.match(photoRouteSource, /where: \{ id: photoId, appointmentId: id \}/);
  assert.match(photoRouteSource, /prisma\.servicePhoto\.delete/);
});

test("saved task photos hide delete controls after next opens payment", () => {
  assert.match(taskDetailSource, /canDeleteTaskPhotos = !paymentStepVisible && !isDone/);
  assert.match(taskDetailSource, /canDelete:\s*boolean/);
  assert.match(taskDetailSource, /\{canDelete && \(/);
  assert.match(taskDetailSource, /canDelete=\{canDeleteTaskPhotos\}/);
});

test("pdf report opens inside an app-controlled viewer with close, save and send actions", () => {
  assert.match(taskDetailSource, /const \[pdfViewer, setPdfViewer\] = useState<\{ url: string; viewUrl: string; whatsappLink: string \} \| null>\(null\)/);
  assert.match(taskDetailSource, /const \[pdfDownloadPending, setPdfDownloadPending\] = useState\(false\)/);
  assert.match(taskDetailSource, /const \[pdfOpenPending, setPdfOpenPending\] = useState\(false\)/);
  assert.match(taskDetailSource, /const \[compactPdfViewer, setCompactPdfViewer\] = useState\(false\)/);
  assert.match(taskDetailSource, /async function regenerateReportPdf\(fallbackUrl: string, fallbackShareLink: string\)/);
  assert.match(taskDetailSource, /fetch\(`\/api\/appointments\/\$\{taskId\}\/report\/regenerate`, \{\s*method: "POST",\s*cache: "no-store"/);
  assert.match(taskDetailSource, /async function openPdf\(url: string, shareLink: string\)/);
  assert.match(taskDetailSource, /const viewUrl = new URL\(href\)/);
  assert.match(taskDetailSource, /viewUrl\.searchParams\.set\("v", String\(Date\.now\(\)\)\)/);
  assert.match(taskDetailSource, /setPdfViewer\(\{ url: href, viewUrl: viewUrl\.toString\(\), whatsappLink: freshReport\.shareLink \}\)/);
  assert.match(taskDetailSource, /window\.matchMedia\("\(display-mode: standalone\)"\)\.matches/);
  assert.match(taskDetailSource, /window\.innerWidth < 768/);
  assert.match(taskDetailSource, /style=\{compactPdfViewer \? \{ width: .* transform: .* transformOrigin: "top left" \} : undefined\}/s);
  // Mobile/PWA viewer requests a width-fitted PDF frame and also scales the embedded viewer for narrow screens.
  assert.match(taskDetailSource, /src=\{`\$\{pdfViewer\.viewUrl\}#toolbar=0&navpanes=0&zoom=page-width&view=FitH`\}/);
  assert.match(taskDetailSource, /onClick=\{\(\) => setPdfViewer\(null\)\}/);
  assert.match(taskDetailSource, /async function handlePdfDownload\(\)/);
  assert.match(taskDetailSource, /fetch\(pdfViewer\.viewUrl, \{ cache: "no-store" \}\)/);
  assert.match(taskDetailSource, /const objectUrl = URL\.createObjectURL\(blob\)/);
  assert.match(taskDetailSource, /link\.download = `service-report-\$\{taskId\}\.pdf`/);
  assert.match(taskDetailSource, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(taskDetailSource, /Send to Client/);
  assert.match(taskDetailSource, /Preparing PDF/);
});

test("technician only sees checkout after report submit, and pdf appears only after checkout", () => {
  assert.match(taskDetailSource, /\{reportSubmitted && !isCheckedOut && \(/);
  assert.match(taskDetailSource, /Report Submitted/);
  assert.match(taskDetailSource, /Checkout to finish the job before generating the PDF report\./);
  assert.match(taskDetailSource, /\{isDone && \(/);
  assert.match(taskDetailSource, /Job Complete!/);
  assert.match(taskDetailSource, /View PDF Report/);
  assert.match(taskDetailSource, /onClick=\{handleCheckout\}/);
  assert.match(taskDetailSource, /action: "checkout",[\s\S]*url: `\/api\/tasks\/\$\{taskId\}\/checkout`/);
  assert.match(taskDetailSource, /await loadTask\(true\)/);
  assert.doesNotMatch(taskDetailSource, /router\.push\("\/tasks"\)/);

  const submittedBlockMatch = taskDetailSource.match(/\{reportSubmitted && !isCheckedOut && \(([\s\S]*?)\n\s*\)\}/);
  assert.ok(submittedBlockMatch, "expected report-submitted block to exist");
  assert.doesNotMatch(submittedBlockMatch[1], /View PDF Report/);

  const doneBlockMatch = taskDetailSource.match(/\{isDone && \(([\s\S]*?)\n\s*\)\}/);
  assert.ok(doneBlockMatch, "expected done block to exist");
  assert.match(doneBlockMatch[1], /View PDF Report/);
});

test("mobile checkout stage hides prior wizard sections to prevent blank scroll space", () => {
  assert.match(taskDetailSource, /const checkoutStageVisible = reportSubmitted && !isCheckedOut/);
  assert.match(taskDetailSource, /const hideBeforeCheckoutOnMobile = checkoutStageVisible \? "hidden md:block" : ""/);
  assert.match(taskDetailSource, /<div className=\{hideBeforeCheckoutOnMobile\}>\s*<Stepper current=\{currentStep\} \/>/);
  assert.match(taskDetailSource, /className=\{`bg-white rounded-xl border border-gray-200 p-4 space-y-3 \$\{hideBeforeCheckoutOnMobile\}`\}/);
  assert.match(taskDetailSource, /\{reportSubmitted && !isCheckedOut && \(/);
});

test("start route only changes appointment status and check-in can validate selected location coordinates", () => {
  assert.match(startRouteSource, /prisma\.appointment\.update/);
  assert.match(startRouteSource, /status: "IN_PROGRESS"/);
  assert.doesNotMatch(startRouteSource, /checkIn\.create/);

  assert.match(checkInRouteSource, /targetLat/);
  assert.match(checkInRouteSource, /targetLng/);
  assert.match(checkInRouteSource, /const checkLat = typeof targetLat === "number" \? targetLat : appt\.locationLat/);
  assert.match(checkInRouteSource, /const distance = haversineDistance\(lat, lng, checkLat, checkLng\)/);
});

test("active task detail receives teammate updates without leaving the app", () => {
  assert.match(taskDetailSource, /const TASK_DETAIL_LIVE_POLL_MS = 3 \* 1000/);
  assert.match(taskDetailSource, /const liveTaskFinished = !!task\?\.clockOutAt/);
  assert.match(taskDetailSource, /if \(liveTaskFinished\) return;/);
  assert.match(taskDetailSource, /if \(document\.visibilityState !== "visible"\) return/);
  assert.match(taskDetailSource, /if \(!navigator\.onLine\) return/);
  assert.match(taskDetailSource, /if \(liveRefreshInFlightRef\.current\) return/);
  assert.match(taskDetailSource, /loadTask\(true\)\.finally/);
  assert.match(taskDetailSource, /window\.setInterval\(refreshWhenVisible, TASK_DETAIL_LIVE_POLL_MS\)/);
  assert.match(taskDetailSource, /window\.addEventListener\("focus", refreshWhenVisible\)/);
  assert.match(taskDetailSource, /document\.addEventListener\("visibilitychange", refreshWhenVisible\)/);
  assert.doesNotMatch(taskDetailSource, /TASK_DETAIL_SOS_POLL_MS/);
});
