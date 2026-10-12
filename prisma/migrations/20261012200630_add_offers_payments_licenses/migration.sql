-- CreateEnum
CREATE TYPE "LicenseType" AS ENUM ('NON_EXCLUSIVE', 'EXCLUSIVE');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('PENDING', 'COUNTERED', 'DECLINED', 'AWAITING_PAYMENT', 'PAID', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED');

-- AlterTable
ALTER TABLE "Beat" ADD COLUMN     "exclusivePriceCents" INTEGER,
ADD COLUMN     "exclusiveSold" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "beatId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "licenseType" "LicenseType" NOT NULL,
    "listingPriceCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "counterAmountCents" INTEGER,
    "agreedAmountCents" INTEGER,
    "message" TEXT,
    "counterMessage" TEXT,
    "status" "OfferStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "stripeSessionId" TEXT NOT NULL,
    "stripePaymentIntentId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "beatId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "licenseType" "LicenseType" NOT NULL,
    "offerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "License" (
    "id" TEXT NOT NULL,
    "beatId" TEXT NOT NULL,
    "artistId" TEXT NOT NULL,
    "licenseType" "LicenseType" NOT NULL,
    "pricePaidCents" INTEGER NOT NULL,
    "paymentId" TEXT,
    "offerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "License_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Offer_producerId_status_idx" ON "Offer"("producerId", "status");

-- CreateIndex
CREATE INDEX "Offer_artistId_idx" ON "Offer"("artistId");

-- CreateIndex
CREATE INDEX "Offer_status_expiresAt_idx" ON "Offer"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_stripeSessionId_key" ON "Payment"("stripeSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_offerId_key" ON "Payment"("offerId");

-- CreateIndex
CREATE UNIQUE INDEX "License_paymentId_key" ON "License"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "License_offerId_key" ON "License"("offerId");

-- CreateIndex
CREATE INDEX "License_artistId_idx" ON "License"("artistId");

-- CreateIndex
CREATE UNIQUE INDEX "License_beatId_artistId_licenseType_key" ON "License"("beatId", "artistId", "licenseType");

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_artistId_fkey" FOREIGN KEY ("artistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "License" ADD CONSTRAINT "License_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
