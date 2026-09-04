-- AlterTable
ALTER TABLE "PromissoryNote" ADD COLUMN     "planInterestCents" BIGINT,
ADD COLUMN     "planModel" TEXT,
ADD COLUMN     "planPrincipalCents" BIGINT;
