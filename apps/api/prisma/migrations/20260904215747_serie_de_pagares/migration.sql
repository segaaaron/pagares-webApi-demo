-- AlterTable
ALTER TABLE "PromissoryNote" ADD COLUMN     "seriesId" UUID,
ADD COLUMN     "seriesIndex" INTEGER,
ADD COLUMN     "seriesSize" INTEGER;

-- CreateIndex
CREATE INDEX "PromissoryNote_seriesId_seriesIndex_idx" ON "PromissoryNote"("seriesId", "seriesIndex");
