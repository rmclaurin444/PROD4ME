-- Prompt 15: transactional emails (receipts, sale notices, offer emails).

-- AlterTable: email preferences (offer and sale emails can be turned off;
-- receipts and free-claim confirmations are always sent)
ALTER TABLE "User" ADD COLUMN "emailOffers" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "emailSales" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: send-once markers (Stripe can deliver a webhook more than once)
ALTER TABLE "Payment" ADD COLUMN "receiptSentAt" TIMESTAMP(3),
ADD COLUMN "saleNoticeSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmailLog_kind_refId_userId_key" ON "EmailLog"("kind", "refId", "userId");

-- CreateIndex
CREATE INDEX "EmailLog_userId_idx" ON "EmailLog"("userId");

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
