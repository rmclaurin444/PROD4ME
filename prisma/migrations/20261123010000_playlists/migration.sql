-- Bulk beat upload as a playlist
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "producerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "artKey" TEXT,
    "artPreset" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_producerId_fkey" FOREIGN KEY ("producerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Playlist_producerId_idx" ON "Playlist"("producerId");

ALTER TABLE "Beat" ADD COLUMN "playlistId" TEXT;
ALTER TABLE "Beat" ADD COLUMN "playlistPosition" INTEGER;

ALTER TABLE "Beat" ADD CONSTRAINT "Beat_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Beat_playlistId_idx" ON "Beat"("playlistId");
