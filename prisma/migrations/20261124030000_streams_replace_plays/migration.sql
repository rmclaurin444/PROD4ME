-- Streams replace plays as the on-screen view count.
-- STREAM = a beat watched for at least SKIP_UNDER_MILLIS (3s) of visible
-- feed time; one per user per beat per 10 minutes is stored.

ALTER TYPE "EngagementEventType" ADD VALUE 'STREAM' AFTER 'SKIP';

ALTER TABLE "Beat" ADD COLUMN "streams" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Beat" DROP COLUMN "plays";
