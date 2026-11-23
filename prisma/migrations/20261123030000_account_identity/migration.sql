-- Account identity fields: username, phone, verification timestamps.
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "pendingEmail" TEXT;

-- Existing users are trusted: nobody gets locked out by this migration.
UPDATE "User" SET "emailVerifiedAt" = NOW() WHERE "emailVerifiedAt" IS NULL;

-- Backfill usernames from the display name (slugified; numeric suffix on
-- collision). Final values are 3–20 chars of [a-z0-9_.].
WITH cleaned AS (
  SELECT "id", "createdAt",
         LOWER(REGEXP_REPLACE("name", '[^a-zA-Z0-9_.]+', '_', 'g')) AS raw
  FROM "User"
),
based AS (
  SELECT "id", "createdAt",
    CASE
      WHEN CHAR_LENGTH(raw) >= 3 THEN LEFT(raw, 15)
      ELSE 'user' || LEFT("id", 8)
    END AS base
  FROM cleaned
),
numbered AS (
  SELECT "id", base, ROW_NUMBER() OVER (PARTITION BY base ORDER BY "createdAt", "id") AS rn
  FROM based
)
UPDATE "User" u
SET "username" = CASE WHEN n.rn = 1 THEN n.base ELSE LEFT(n.base || '_' || n.rn, 20) END
FROM numbered n
WHERE n."id" = u."id" AND u."username" IS NULL;

-- Required + unique after the backfill.
ALTER TABLE "User" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- Single-use verification tokens (email verify / email change / phone verify)
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "VerificationToken_userId_kind_idx" ON "VerificationToken"("userId", "kind");
