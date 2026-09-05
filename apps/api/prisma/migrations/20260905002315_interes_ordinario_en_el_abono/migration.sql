-- AlterTable
ALTER TABLE "OrganizationSettings" ADD COLUMN     "lateInterestOverPrincipalOnly" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "appliedToOrdinaryInterestCents" BIGINT NOT NULL DEFAULT 0;
