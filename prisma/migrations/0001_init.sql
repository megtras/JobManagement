-- CreateTable
CREATE TABLE "Branch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "staffNo" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "position" TEXT,
    "identificationNo" TEXT,
    "branchId" TEXT,
    "phone" TEXT,
    "technicianStatus" TEXT,
    "lastLocationLat" REAL,
    "lastLocationLng" REAL,
    "lastLocationArea" TEXT,
    "lastLocationAddress" TEXT,
    "lastLocationAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "User_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Team_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobCategory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "price" DECIMAL NOT NULL,
    "minEvidencePhotos" INTEGER NOT NULL DEFAULT 3,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "custNo" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "custType" TEXT NOT NULL DEFAULT 'END_USER',
    "phone" TEXT NOT NULL,
    "phone2" TEXT,
    "email" TEXT,
    "area" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL DEFAULT 'OTHERS',
    "jobCategoryId" TEXT,
    "branchId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Customer_jobCategoryId_fkey" FOREIGN KEY ("jobCategoryId") REFERENCES "JobCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomerAddress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" REAL,
    "lng" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CustomerAddress_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobNo" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "jobCategoryId" TEXT,
    "jobTitle" TEXT NOT NULL DEFAULT '',
    "date" DATETIME NOT NULL,
    "time" TEXT NOT NULL,
    "timeFinish" TEXT NOT NULL DEFAULT '',
    "locationAddress" TEXT NOT NULL DEFAULT '',
    "locationLat" REAL,
    "locationLng" REAL,
    "locationWazeLink" TEXT NOT NULL DEFAULT '',
    "technicianId" TEXT,
    "parentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMING_SOON',
    "billingType" TEXT NOT NULL DEFAULT 'CHARGEABLE',
    "warrantyNote" TEXT,
    "totalPrice" DECIMAL NOT NULL,
    "commission" DECIMAL,
    "approvedAt" DATETIME,
    "approvedById" TEXT,
    "clockInAt" DATETIME,
    "clockOutAt" DATETIME,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "urgentReason" TEXT,
    "urgentAt" DATETIME,
    "checkInSosRequestedAt" DATETIME,
    "checkInSosRequestedById" TEXT,
    "checkInSosAddress" TEXT,
    "checkInSosLat" REAL,
    "checkInSosLng" REAL,
    "checkInSosResolvedAt" DATETIME,
    "checkInSosResolvedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Appointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Appointment_jobCategoryId_fkey" FOREIGN KEY ("jobCategoryId") REFERENCES "JobCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Appointment_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Appointment_checkInSosRequestedById_fkey" FOREIGN KEY ("checkInSosRequestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Appointment_checkInSosResolvedById_fkey" FOREIGN KEY ("checkInSosResolvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Appointment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Appointment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppointmentAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointmentId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "acType" TEXT NOT NULL DEFAULT '',
    "jobCategoryId" TEXT,
    "unitPrice" DECIMAL NOT NULL DEFAULT 0,
    "billingType" TEXT NOT NULL DEFAULT 'CHARGEABLE',
    "isTroubleshoot" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "technicianRemark" TEXT,
    "additionalAddress" TEXT,
    "propertyType" TEXT NOT NULL DEFAULT '',
    "workLocationAddress" TEXT NOT NULL DEFAULT '',
    "workLocationLat" REAL,
    "workLocationLng" REAL,
    CONSTRAINT "AppointmentAsset_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AppointmentAsset_jobCategoryId_fkey" FOREIGN KEY ("jobCategoryId") REFERENCES "JobCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointmentId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "receiptPhotoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "rejectReason" TEXT,
    "approvedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ServicePhoto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointmentId" TEXT NOT NULL,
    "assetId" TEXT,
    "photoUrl" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ServicePhoto_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ServicePhoto_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "AppointmentAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointmentId" TEXT NOT NULL,
    "technicianId" TEXT NOT NULL,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'GPS',
    "approvedById" TEXT,
    "checkedInAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckIn_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CheckIn_technicianId_fkey" FOREIGN KEY ("technicianId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "appointmentId" TEXT NOT NULL,
    "technicianName" TEXT NOT NULL,
    "technicianSignature" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientSignature" TEXT NOT NULL,
    "reportDate" DATETIME NOT NULL,
    "pdfUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DONE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Report_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "relatedAppointmentId" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Notification_relatedAppointmentId_fkey" FOREIGN KEY ("relatedAppointmentId") REFERENCES "Appointment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebsiteLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "leadNo" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW_ENQUIRY',
    "conversionMethod" TEXT NOT NULL DEFAULT 'BOOKING_FORM',
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneNormalized" TEXT NOT NULL,
    "email" TEXT,
    "serviceType" TEXT NOT NULL,
    "customerType" TEXT NOT NULL,
    "serviceArea" TEXT NOT NULL,
    "propertyType" TEXT NOT NULL,
    "unitQuantityRange" TEXT NOT NULL,
    "message" TEXT,
    "websiteLanguage" TEXT NOT NULL DEFAULT 'ms',
    "leadSource" TEXT NOT NULL DEFAULT 'direct',
    "firstLandingPage" TEXT,
    "latestLandingPage" TEXT,
    "referrer" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "gclid" TEXT,
    "gbraid" TEXT,
    "wbraid" TEXT,
    "analyticsConsent" BOOLEAN NOT NULL DEFAULT false,
    "advertisingConsent" BOOLEAN NOT NULL DEFAULT false,
    "customerId" TEXT,
    "appointmentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WebsiteLead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WebsiteLead_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebsiteLeadMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "websiteLeadId" TEXT NOT NULL,
    "externalMessageId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'whatsapp',
    "direction" TEXT NOT NULL DEFAULT 'inbound',
    "messageType" TEXT NOT NULL,
    "content" TEXT,
    "receivedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebsiteLeadMessage_websiteLeadId_fkey" FOREIGN KEY ("websiteLeadId") REFERENCES "WebsiteLead" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_TeamMembers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_TeamMembers_A_fkey" FOREIGN KEY ("A") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_TeamMembers_B_fkey" FOREIGN KEY ("B") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "_AppointmentTeams" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_AppointmentTeams_A_fkey" FOREIGN KEY ("A") REFERENCES "Appointment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_AppointmentTeams_B_fkey" FOREIGN KEY ("B") REFERENCES "Team" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_staffNo_key" ON "User"("staffNo");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_branchId_idx" ON "User"("branchId");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "User"("role");

-- CreateIndex
CREATE INDEX "User_lastLocationAt_idx" ON "User"("lastLocationAt");

-- CreateIndex
CREATE INDEX "Team_branchId_idx" ON "Team"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_custNo_key" ON "Customer"("custNo");

-- CreateIndex
CREATE INDEX "Customer_branchId_idx" ON "Customer"("branchId");

-- CreateIndex
CREATE INDEX "Customer_status_idx" ON "Customer"("status");

-- CreateIndex
CREATE INDEX "Customer_jobCategoryId_idx" ON "Customer"("jobCategoryId");

-- CreateIndex
CREATE INDEX "CustomerAddress_customerId_idx" ON "CustomerAddress"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_jobNo_key" ON "Appointment"("jobNo");

-- CreateIndex
CREATE INDEX "Appointment_branchId_idx" ON "Appointment"("branchId");

-- CreateIndex
CREATE INDEX "Appointment_status_idx" ON "Appointment"("status");

-- CreateIndex
CREATE INDEX "Appointment_billingType_idx" ON "Appointment"("billingType");

-- CreateIndex
CREATE INDEX "Appointment_date_idx" ON "Appointment"("date");

-- CreateIndex
CREATE INDEX "Appointment_technicianId_idx" ON "Appointment"("technicianId");

-- CreateIndex
CREATE INDEX "Appointment_customerId_idx" ON "Appointment"("customerId");

-- CreateIndex
CREATE INDEX "Appointment_parentId_idx" ON "Appointment"("parentId");

-- CreateIndex
CREATE INDEX "Appointment_checkInSosRequestedAt_idx" ON "Appointment"("checkInSosRequestedAt");

-- CreateIndex
CREATE INDEX "Appointment_checkInSosResolvedAt_idx" ON "Appointment"("checkInSosResolvedAt");

-- CreateIndex
CREATE INDEX "Appointment_checkInSosRequestedById_idx" ON "Appointment"("checkInSosRequestedById");

-- CreateIndex
CREATE INDEX "Appointment_checkInSosResolvedById_idx" ON "Appointment"("checkInSosResolvedById");

-- CreateIndex
CREATE INDEX "AppointmentAsset_appointmentId_idx" ON "AppointmentAsset"("appointmentId");

-- CreateIndex
CREATE INDEX "AppointmentAsset_jobCategoryId_idx" ON "AppointmentAsset"("jobCategoryId");

-- CreateIndex
CREATE INDEX "AppointmentAsset_billingType_idx" ON "AppointmentAsset"("billingType");

-- CreateIndex
CREATE INDEX "AppointmentAsset_isTroubleshoot_idx" ON "AppointmentAsset"("isTroubleshoot");

-- CreateIndex
CREATE INDEX "Payment_appointmentId_idx" ON "Payment"("appointmentId");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "ServicePhoto_appointmentId_idx" ON "ServicePhoto"("appointmentId");

-- CreateIndex
CREATE INDEX "ServicePhoto_type_idx" ON "ServicePhoto"("type");

-- CreateIndex
CREATE INDEX "CheckIn_appointmentId_idx" ON "CheckIn"("appointmentId");

-- CreateIndex
CREATE INDEX "CheckIn_technicianId_idx" ON "CheckIn"("technicianId");

-- CreateIndex
CREATE UNIQUE INDEX "Report_appointmentId_key" ON "Report"("appointmentId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_relatedAppointmentId_idx" ON "Notification"("relatedAppointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteLead_leadNo_key" ON "WebsiteLead"("leadNo");

-- CreateIndex
CREATE INDEX "WebsiteLead_status_idx" ON "WebsiteLead"("status");

-- CreateIndex
CREATE INDEX "WebsiteLead_phoneNormalized_idx" ON "WebsiteLead"("phoneNormalized");

-- CreateIndex
CREATE INDEX "WebsiteLead_leadSource_idx" ON "WebsiteLead"("leadSource");

-- CreateIndex
CREATE INDEX "WebsiteLead_utmCampaign_idx" ON "WebsiteLead"("utmCampaign");

-- CreateIndex
CREATE INDEX "WebsiteLead_serviceType_idx" ON "WebsiteLead"("serviceType");

-- CreateIndex
CREATE INDEX "WebsiteLead_serviceArea_idx" ON "WebsiteLead"("serviceArea");

-- CreateIndex
CREATE INDEX "WebsiteLead_createdAt_idx" ON "WebsiteLead"("createdAt");

-- CreateIndex
CREATE INDEX "WebsiteLead_customerId_idx" ON "WebsiteLead"("customerId");

-- CreateIndex
CREATE INDEX "WebsiteLead_appointmentId_idx" ON "WebsiteLead"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteLeadMessage_externalMessageId_key" ON "WebsiteLeadMessage"("externalMessageId");

-- CreateIndex
CREATE INDEX "WebsiteLeadMessage_websiteLeadId_receivedAt_idx" ON "WebsiteLeadMessage"("websiteLeadId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "_TeamMembers_AB_unique" ON "_TeamMembers"("A", "B");

-- CreateIndex
CREATE INDEX "_TeamMembers_B_index" ON "_TeamMembers"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_AppointmentTeams_AB_unique" ON "_AppointmentTeams"("A", "B");

-- CreateIndex
CREATE INDEX "_AppointmentTeams_B_index" ON "_AppointmentTeams"("B");
