-- CreateEnum
CREATE TYPE "EngagementEventType" AS ENUM ('PLAY_50', 'PLAY_COMPLETE', 'TAG_TAP', 'LIKE', 'SAVE', 'FOLLOW_PRODUCER', 'OFFER', 'BUY', 'SKIP');

-- CreateTable
CREATE TABLE "EngagementEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "beatId" TEXT NOT NULL,
    "type" "EngagementEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EngagementEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EngagementEvent_userId_createdAt_idx" ON "EngagementEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EngagementEvent_beatId_idx" ON "EngagementEvent"("beatId");

-- AddForeignKey
ALTER TABLE "EngagementEvent" ADD CONSTRAINT "EngagementEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EngagementEvent" ADD CONSTRAINT "EngagementEvent_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE CASCADE ON UPDATE CASCADE;
