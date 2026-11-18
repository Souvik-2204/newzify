BEGIN;
-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "approvalLocked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "bodyDoc" JSONB,
ADD COLUMN     "creatorId" TEXT,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "indiaConfirmed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "metaDescription" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "publicationDate" TIMESTAMP(3),
ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "seoTitle" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT,
ALTER COLUMN "sourceDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "available" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "agreedAmountPaise" INTEGER,
ADD COLUMN     "agreedGatewayPlanId" TEXT;

-- CreateTable
CREATE TABLE "Publication" (
    "id" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "bodyDoc" JSONB,
    "image" TEXT NOT NULL,
    "imageCredit" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "access" "Level" NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourceDate" TIMESTAMP(3) NOT NULL,
    "region" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "seoTitle" TEXT NOT NULL DEFAULT '',
    "metaDescription" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Publication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsroomSettings" (
    "id" TEXT NOT NULL DEFAULT 'edition',
    "defaultApproval" BOOLEAN NOT NULL DEFAULT true,
    "defaultAccess" "Level" NOT NULL DEFAULT 'FREE',
    "deskNote" TEXT NOT NULL DEFAULT '',
    "layoutVersion" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsroomSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminEvent" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_EditorialAssignments" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_EditorialAssignments_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_LiveTags" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_LiveTags_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Publication_slug_key" ON "Publication"("slug");

-- CreateIndex
CREATE INDEX "Publication_region_sourceDate_publishedAt_idx" ON "Publication"("region", "sourceDate", "publishedAt");

-- CreateIndex
CREATE INDEX "Publication_categoryId_publishedAt_idx" ON "Publication"("categoryId", "publishedAt");

-- CreateIndex
CREATE INDEX "AdminEvent_entity_entityId_createdAt_idx" ON "AdminEvent"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "_EditorialAssignments_B_index" ON "_EditorialAssignments"("B");

-- CreateIndex
CREATE INDEX "_LiveTags_B_index" ON "_LiveTags"("B");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_id_fkey" FOREIGN KEY ("id") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Publication" ADD CONSTRAINT "Publication_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminEvent" ADD CONSTRAINT "AdminEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EditorialAssignments" ADD CONSTRAINT "_EditorialAssignments_A_fkey" FOREIGN KEY ("A") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_EditorialAssignments" ADD CONSTRAINT "_EditorialAssignments_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LiveTags" ADD CONSTRAINT "_LiveTags_A_fkey" FOREIGN KEY ("A") REFERENCES "Publication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_LiveTags" ADD CONSTRAINT "_LiveTags_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Preserve every existing published page, byline, source date and subscription contract.
UPDATE "Article" SET "creatorId"="authorId", "indiaConfirmed"=("region"='IN'), "publicationDate"="publishedAt",
 "approvalLocked"=EXISTS(SELECT 1 FROM "Approval" ap WHERE ap."articleId"="Article".id AND ap.action='SUBMITTED'),
 "submittedById"=(SELECT "actorId" FROM "Approval" ap WHERE ap."articleId"="Article".id AND ap.action='SUBMITTED' ORDER BY ap."createdAt" DESC LIMIT 1),
 "submittedAt"=(SELECT max(ap."createdAt") FROM "Approval" ap WHERE ap."articleId"="Article".id AND ap.action='SUBMITTED');
ALTER TABLE "Article" ALTER COLUMN "creatorId" SET NOT NULL;
INSERT INTO "Publication" (id,revision,slug,title,summary,content,image,"imageCredit","authorId","categoryId",access,"sourceName","sourceUrl","sourceDate",region,location,"publishedAt")
 SELECT id,revision,slug,title,summary,content,image,"imageCredit","authorId","categoryId",access,"sourceName","sourceUrl","sourceDate",region,location,"publishedAt" FROM "Article" WHERE status='PUBLISHED' AND "publishedAt" IS NOT NULL;
INSERT INTO "_LiveTags" ("A","B") SELECT t."A",t."B" FROM "_ArticleToTag" t JOIN "Publication" p ON p.id=t."A";
INSERT INTO "_EditorialAssignments" ("A","B") SELECT "sectionId",id FROM "User" WHERE "roleId"='SECTION_EDITOR' AND "sectionId" IS NOT NULL;
INSERT INTO "NewsroomSettings" (id,"updatedAt") VALUES ('edition',CURRENT_TIMESTAMP);
UPDATE "Subscription" s SET "agreedAmountPaise"=CASE WHEN s.cycle='annual' THEN p."annualPaise" ELSE p."monthlyPaise" END,
 "agreedGatewayPlanId"=CASE WHEN s.cycle='annual' THEN p."gatewayAnnualId" ELSE p."gatewayMonthlyId" END FROM "Plan" p WHERE p.id=s."planId";
COMMIT;
