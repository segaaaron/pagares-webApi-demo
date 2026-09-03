-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CLIENT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'DISABLED');

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('PASSWORD_CHANGE', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "ChangeReason" AS ENUM ('INITIAL', 'SELF_CHANGE', 'FORGOT', 'ADMIN_RESET');

-- CreateEnum
CREATE TYPE "NoteStatus" AS ENUM ('PENDING_SIGNATURE', 'PROCESSING_SIGNATURE', 'ISSUED', 'PARTIALLY_PAID', 'OVERDUE', 'PAID', 'RESTRUCTURED', 'RENEWED', 'WRITTEN_OFF', 'VOID');

-- CreateEnum
CREATE TYPE "PortfolioClass" AS ENUM ('VIGENTE', 'VENCIDA');

-- CreateEnum
CREATE TYPE "AgingBucket" AS ENUM ('CURRENT', 'D1_30', 'D31_60', 'D61_90', 'D91_120', 'D120_PLUS');

-- CreateEnum
CREATE TYPE "CollectionStage" AS ENUM ('PREVENTIVA', 'ADMINISTRATIVA', 'EXTRAJUDICIAL', 'JUDICIAL', 'CASTIGO');

-- CreateEnum
CREATE TYPE "SignatureMode" AS ENUM ('REMOTE', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'TRANSFER', 'CHECK', 'OTHER');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('ACTIVE', 'FULFILLED', 'BROKEN');

-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('EMAIL', 'PUSH', 'WHATSAPP', 'SMS');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED');

-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('CALL', 'WHATSAPP', 'EMAIL', 'VISIT', 'OTHER');

-- CreateEnum
CREATE TYPE "ActivityOutcome" AS ENUM ('NO_ANSWER', 'PROMISED', 'REFUSED', 'PAID', 'DISPUTED');

-- CreateEnum
CREATE TYPE "SequenceType" AS ENUM ('NOTE', 'RECEIPT', 'STATEMENT');

-- CreateEnum
CREATE TYPE "IdemStatus" AS ENUM ('IN_FLIGHT', 'COMPLETED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'CLIENT',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "passwordHash" TEXT NOT NULL,
    "pwdVersion" INTEGER NOT NULL DEFAULT 1,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "tempPasswordExpiresAt" TIMESTAMP(3),
    "passwordUpdatedAt" TIMESTAMP(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdByAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Identity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Identity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "deviceId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordChangeLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "ChangeReason" NOT NULL,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'ios',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Debtor" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "userId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debtor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromissoryNote" (
    "id" TEXT NOT NULL,
    "folio" TEXT NOT NULL,
    "publicToken" TEXT NOT NULL,
    "status" "NoteStatus" NOT NULL DEFAULT 'PENDING_SIGNATURE',
    "portfolioClass" "PortfolioClass" NOT NULL DEFAULT 'VIGENTE',
    "agingBucket" "AgingBucket" NOT NULL DEFAULT 'CURRENT',
    "collectionStage" "CollectionStage" NOT NULL DEFAULT 'PREVENTIVA',
    "stageFrozen" BOOLEAN NOT NULL DEFAULT false,
    "daysOverdue" INTEGER NOT NULL DEFAULT 0,
    "issuePlace" TEXT NOT NULL,
    "issueDate" DATE NOT NULL,
    "paymentPlace" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "creditorName" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "amountInWords" TEXT NOT NULL,
    "observations" TEXT,
    "interestRateAnnualPct" DECIMAL(5,2),
    "paidCents" BIGINT NOT NULL DEFAULT 0,
    "debtorId" TEXT NOT NULL,
    "ownerId" TEXT,
    "requiresGuarantors" INTEGER NOT NULL DEFAULT 0,
    "signatureMode" "SignatureMode",
    "acceptedAt" TIMESTAMP(3),
    "scrolledToEndAt" TIMESTAMP(3),
    "prescribesOn" DATE,
    "inLitigation" BOOLEAN NOT NULL DEFAULT false,
    "physicalDocumentLocation" TEXT,
    "renewedFromId" TEXT,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "voidedBy" TEXT,
    "writtenOffAt" TIMESTAMP(3),
    "writeOffReason" TEXT,
    "writtenOffBy" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromissoryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteExtension" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "previousDue" DATE NOT NULL,
    "newDue" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "authorizedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteExtension_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guarantor" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,

    CONSTRAINT "Guarantor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "profile" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Signature" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "thumbAssetId" TEXT,
    "vectorAssetId" TEXT,
    "sha256" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "strokeCount" INTEGER,
    "durationMs" INTEGER,
    "inputType" TEXT,
    "deviceModel" TEXT,
    "osVersion" TEXT,
    "appVersion" TEXT,
    "ipAddress" TEXT,
    "mode" "SignatureMode" NOT NULL DEFAULT 'REMOTE',
    "enabledBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Signature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuarantorSignature" (
    "id" TEXT NOT NULL,
    "guarantorId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "mode" "SignatureMode" NOT NULL DEFAULT 'REMOTE',
    "ipAddress" TEXT,
    "deviceModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuarantorSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "interestAccruedCents" BIGINT NOT NULL DEFAULT 0,
    "appliedToInterestCents" BIGINT NOT NULL DEFAULT 0,
    "appliedToPrincipalCents" BIGINT NOT NULL DEFAULT 0,
    "isRecovery" BOOLEAN NOT NULL DEFAULT false,
    "paidOn" DATE NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "reference" TEXT,
    "memo" TEXT,
    "reversalOfId" TEXT,
    "reversalReason" TEXT,
    "registeredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "agreedCents" BIGINT NOT NULL,
    "forgivenCents" BIGINT NOT NULL DEFAULT 0,
    "dueOn" DATE NOT NULL,
    "terms" TEXT,
    "status" "SettlementStatus" NOT NULL DEFAULT 'ACTIVE',
    "authorizedBy" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderRule" (
    "id" TEXT NOT NULL,
    "offsetDays" INTEGER NOT NULL,
    "channel" "Channel" NOT NULL DEFAULT 'EMAIL',
    "templateId" TEXT NOT NULL,
    "condition" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderLog" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "sentOn" DATE NOT NULL,
    "channel" "Channel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "messageId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionActivity" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "type" "ActivityType" NOT NULL,
    "outcome" "ActivityOutcome" NOT NULL,
    "promisedOn" DATE,
    "promiseKept" BOOLEAN,
    "notes" TEXT,
    "registeredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalCase" (
    "id" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "courtName" TEXT,
    "fileNumber" TEXT,
    "lawyerName" TEXT,
    "lawyerPhone" TEXT,
    "openedOn" DATE NOT NULL,
    "closedOn" DATE,
    "notes" TEXT,
    "openedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LegalAction" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "occurredOn" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "assetIds" TEXT[],
    "registeredBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegalAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "type" "SequenceType" NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("type","year")
);

-- CreateTable
CREATE TABLE "OrganizationSettings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "legalName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "logoAssetId" TEXT,
    "defaultIssuePlace" TEXT NOT NULL,
    "defaultPaymentPlace" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'MXN',
    "defaultTermDays" INTEGER NOT NULL DEFAULT 30,
    "defaultInterestRateAnnualPct" DECIMAL(5,2),
    "interestBasis" INTEGER NOT NULL DEFAULT 360,
    "interestWarningThresholdPct" DECIMAL(5,2) NOT NULL DEFAULT 60.00,
    "applyPaymentToInterestFirst" BOOLEAN NOT NULL DEFAULT true,
    "prescriptionYears" INTEGER NOT NULL DEFAULT 3,
    "timezone" TEXT NOT NULL DEFAULT 'America/Mexico_City',
    "noteFolioPrefix" TEXT NOT NULL DEFAULT 'PAG',
    "receiptFolioPrefix" TEXT NOT NULL DEFAULT 'REC',
    "statementPrefix" TEXT NOT NULL DEFAULT 'EDC',
    "bankName" TEXT,
    "bankAccount" TEXT,
    "bankClabe" TEXT,
    "paymentReference" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "chainIndex" SERIAL NOT NULL,
    "prevHash" TEXT,
    "chainHash" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "key" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "status" "IdemStatus" NOT NULL DEFAULT 'IN_FLIGHT',
    "responseCode" INTEGER,
    "responseBody" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedEvent" (
    "eventId" TEXT NOT NULL,
    "handler" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("eventId","handler")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_createdAt_idx" ON "User"("status", "createdAt");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "Identity_userId_idx" ON "Identity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Identity_provider_subject_key" ON "Identity"("provider", "subject");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_familyId_idx" ON "RefreshToken"("userId", "familyId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "OtpChallenge_userId_purpose_expiresAt_idx" ON "OtpChallenge"("userId", "purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "PasswordChangeLog_userId_createdAt_idx" ON "PasswordChangeLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PasswordHistory_userId_createdAt_idx" ON "PasswordHistory"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceToken_token_key" ON "DeviceToken"("token");

-- CreateIndex
CREATE INDEX "DeviceToken_userId_idx" ON "DeviceToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Debtor_userId_key" ON "Debtor"("userId");

-- CreateIndex
CREATE INDEX "Debtor_fullName_idx" ON "Debtor"("fullName");

-- CreateIndex
CREATE INDEX "Debtor_phone_idx" ON "Debtor"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "PromissoryNote_folio_key" ON "PromissoryNote"("folio");

-- CreateIndex
CREATE UNIQUE INDEX "PromissoryNote_publicToken_key" ON "PromissoryNote"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "PromissoryNote_renewedFromId_key" ON "PromissoryNote"("renewedFromId");

-- CreateIndex
CREATE INDEX "PromissoryNote_status_dueDate_idx" ON "PromissoryNote"("status", "dueDate");

-- CreateIndex
CREATE INDEX "PromissoryNote_portfolioClass_agingBucket_idx" ON "PromissoryNote"("portfolioClass", "agingBucket");

-- CreateIndex
CREATE INDEX "PromissoryNote_ownerId_createdAt_idx" ON "PromissoryNote"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "PromissoryNote_debtorId_status_idx" ON "PromissoryNote"("debtorId", "status");

-- CreateIndex
CREATE INDEX "PromissoryNote_prescribesOn_idx" ON "PromissoryNote"("prescribesOn");

-- CreateIndex
CREATE INDEX "NoteExtension_noteId_createdAt_idx" ON "NoteExtension"("noteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Guarantor_noteId_position_key" ON "Guarantor"("noteId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_profile_createdAt_idx" ON "MediaAsset"("profile", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Signature_noteId_key" ON "Signature"("noteId");

-- CreateIndex
CREATE UNIQUE INDEX "GuarantorSignature_guarantorId_key" ON "GuarantorSignature"("guarantorId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reversalOfId_key" ON "Payment"("reversalOfId");

-- CreateIndex
CREATE INDEX "Payment_noteId_paidOn_idx" ON "Payment"("noteId", "paidOn");

-- CreateIndex
CREATE INDEX "Payment_noteId_createdAt_idx" ON "Payment"("noteId", "createdAt");

-- CreateIndex
CREATE INDEX "Settlement_noteId_status_idx" ON "Settlement"("noteId", "status");

-- CreateIndex
CREATE INDEX "Settlement_status_dueOn_idx" ON "Settlement"("status", "dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderRule_offsetDays_channel_key" ON "ReminderRule"("offsetDays", "channel");

-- CreateIndex
CREATE INDEX "ReminderLog_status_createdAt_idx" ON "ReminderLog"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderLog_noteId_ruleId_sentOn_key" ON "ReminderLog"("noteId", "ruleId", "sentOn");

-- CreateIndex
CREATE INDEX "CollectionActivity_noteId_createdAt_idx" ON "CollectionActivity"("noteId", "createdAt");

-- CreateIndex
CREATE INDEX "CollectionActivity_promisedOn_idx" ON "CollectionActivity"("promisedOn");

-- CreateIndex
CREATE UNIQUE INDEX "LegalCase_noteId_key" ON "LegalCase"("noteId");

-- CreateIndex
CREATE INDEX "LegalAction_caseId_occurredOn_idx" ON "LegalAction"("caseId", "occurredOn");

-- CreateIndex
CREATE UNIQUE INDEX "AuditLog_chainIndex_key" ON "AuditLog"("chainIndex");

-- CreateIndex
CREATE INDEX "AuditLog_targetType_targetId_createdAt_idx" ON "AuditLog"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_expiresAt_idx" ON "IdempotencyKey"("expiresAt");

-- CreateIndex
CREATE INDEX "OutboxMessage_publishedAt_createdAt_idx" ON "OutboxMessage"("publishedAt", "createdAt");

-- AddForeignKey
ALTER TABLE "Identity" ADD CONSTRAINT "Identity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordChangeLog" ADD CONSTRAINT "PasswordChangeLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordHistory" ADD CONSTRAINT "PasswordHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debtor" ADD CONSTRAINT "Debtor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromissoryNote" ADD CONSTRAINT "PromissoryNote_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "Debtor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromissoryNote" ADD CONSTRAINT "PromissoryNote_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromissoryNote" ADD CONSTRAINT "PromissoryNote_renewedFromId_fkey" FOREIGN KEY ("renewedFromId") REFERENCES "PromissoryNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteExtension" ADD CONSTRAINT "NoteExtension_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "PromissoryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guarantor" ADD CONSTRAINT "Guarantor_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "PromissoryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Signature" ADD CONSTRAINT "Signature_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "PromissoryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuarantorSignature" ADD CONSTRAINT "GuarantorSignature_guarantorId_fkey" FOREIGN KEY ("guarantorId") REFERENCES "Guarantor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "PromissoryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "PromissoryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "PromissoryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderLog" ADD CONSTRAINT "ReminderLog_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "ReminderRule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionActivity" ADD CONSTRAINT "CollectionActivity_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "PromissoryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalCase" ADD CONSTRAINT "LegalCase_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "PromissoryNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegalAction" ADD CONSTRAINT "LegalAction_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "LegalCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
