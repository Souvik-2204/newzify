BEGIN;
-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "inlineUploads" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Publication" ADD COLUMN     "inlineUploads" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "UploadedImage" (
    "path" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedImage_pkey" PRIMARY KEY ("path")
);

-- CreateIndex
CREATE INDEX "Article_inlineUploads_idx" ON "Article" USING GIN ("inlineUploads");

-- CreateIndex
CREATE INDEX "Publication_inlineUploads_idx" ON "Publication" USING GIN ("inlineUploads");

-- AddForeignKey
ALTER TABLE "UploadedImage" ADD CONSTRAINT "UploadedImage_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Index existing document references without changing the released edition.
UPDATE "Article" a SET "inlineUploads" = ARRAY(SELECT DISTINCT x #>> '{}' FROM jsonb_path_query(a."bodyDoc", '$.**.attrs.src') x WHERE (x #>> '{}') LIKE '/uploads/%') WHERE a."bodyDoc" IS NOT NULL;
UPDATE "Publication" p SET "inlineUploads" = ARRAY(SELECT DISTINCT x #>> '{}' FROM jsonb_path_query(p."bodyDoc", '$.**.attrs.src') x WHERE (x #>> '{}') LIKE '/uploads/%') WHERE p."bodyDoc" IS NOT NULL;
COMMIT;
