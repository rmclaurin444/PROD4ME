-- Lightweight feed-refresh analytics counter (Prompt 12). One row per
-- refresh — NOT an engagement event or recommendation signal.
CREATE TABLE "FeedRefresh" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedRefresh_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeedRefresh_createdAt_idx" ON "FeedRefresh"("createdAt");

-- AddForeignKey
ALTER TABLE "FeedRefresh" ADD CONSTRAINT "FeedRefresh_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
