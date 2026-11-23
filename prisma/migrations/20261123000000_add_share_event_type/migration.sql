-- Add SHARE engagement type (counters + analytics). Postgres 12+ allows
-- ADD VALUE inside a migration; the value is not used in this same script.
ALTER TYPE "EngagementEventType" ADD VALUE IF NOT EXISTS 'SHARE';
