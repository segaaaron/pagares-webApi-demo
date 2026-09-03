-- CreateTable
CREATE TABLE "EmailDelivery" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "templateId" TEXT,
    "noteId" TEXT,
    "userId" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'SENT',
    "error" TEXT,
    "lastEvent" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailDelivery_messageId_key" ON "EmailDelivery"("messageId");

-- CreateIndex
CREATE INDEX "EmailDelivery_noteId_sentAt_idx" ON "EmailDelivery"("noteId", "sentAt");

-- CreateIndex
CREATE INDEX "EmailDelivery_status_sentAt_idx" ON "EmailDelivery"("status", "sentAt");
