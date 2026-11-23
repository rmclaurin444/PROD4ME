-- Weekly leaderboard snapshots
CREATE TABLE "LeaderboardSnapshot" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "kind" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "beatId" TEXT,
    "producerId" TEXT,
    "score" DOUBLE PRECISION NOT NULL,
    "breakdown" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaderboardSnapshot_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "LeaderboardSnapshot" ADD CONSTRAINT "LeaderboardSnapshot_beatId_fkey" FOREIGN KEY ("beatId") REFERENCES "Beat"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaderboardSnapshot" ADD CONSTRAINT "LeaderboardSnapshot_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "LeaderboardSnapshot_weekStart_kind_rank_key" ON "LeaderboardSnapshot"("weekStart", "kind", "rank");
CREATE INDEX "LeaderboardSnapshot_weekStart_kind_idx" ON "LeaderboardSnapshot"("weekStart", "kind");
