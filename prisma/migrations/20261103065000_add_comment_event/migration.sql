-- Adds the COMMENT engagement event type.
-- (Postgres 12+ allows ALTER TYPE ... ADD VALUE inside a transaction; the new
-- member just can't be *used* until the transaction commits, which we don't.)

ALTER TYPE "EngagementEventType" ADD VALUE 'COMMENT';
