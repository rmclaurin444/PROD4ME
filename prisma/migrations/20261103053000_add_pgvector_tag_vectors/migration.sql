-- pgvector: tag vectors for beats, taste vectors for users.
--
-- ORDER MATTERS: the extension must exist before the vector columns in the
-- Prisma-generated statements below can be created.

CREATE EXTENSION IF NOT EXISTS vector;

-- AlterTable
ALTER TABLE "Beat" ADD COLUMN     "tagVector" vector(256);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tasteVector" vector(256);

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "vectorIndex" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "Tag_vectorIndex_key" ON "Tag"("vectorIndex");

-- Backfill: hand every existing tag a stable slot (0..255) in creation order.
-- Tags beyond the 256th stay NULL — they keep working for display/filtering
-- but are invisible to the vector math (task rule).
WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY id) - 1 AS slot
    FROM "Tag"
    WHERE "vectorIndex" IS NULL
)
UPDATE "Tag" SET "vectorIndex" = ranked.slot
FROM ranked
WHERE "Tag"."id" = ranked.id AND ranked.slot < 256;

-- Auto-assign a slot at tag creation: the next free sequential index (max+1),
-- or NULL when all 256 are taken. Nulls in the unique index never collide.
-- Trigger-level assignment keeps every creation path covered (app, seed,
-- connectOrCreate), so callers never need to know about slots.
CREATE OR REPLACE FUNCTION assign_tag_vector_index() RETURNS trigger AS $$
DECLARE
    next_index INTEGER;
BEGIN
    IF NEW."vectorIndex" IS NOT NULL THEN
        RETURN NEW;
    END IF;
    SELECT COALESCE(MAX("vectorIndex"), -1) + 1 INTO next_index FROM "Tag";
    IF next_index >= 256 THEN
        NEW."vectorIndex" := NULL;
    ELSE
        NEW."vectorIndex" := next_index;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tag_vector_index_autoassign
BEFORE INSERT ON "Tag"
FOR EACH ROW
EXECUTE FUNCTION assign_tag_vector_index();

-- ANN index for the beat vectors the recommender will search against.
CREATE INDEX "Beat_tagVector_hnsw_idx" ON "Beat" USING hnsw ("tagVector" vector_cosine_ops);
