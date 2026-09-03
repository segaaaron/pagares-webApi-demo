-- CreateEnum
CREATE TYPE "InterestPeriod" AS ENUM ('MONTHLY', 'ANNUAL');

-- AlterTable
ALTER TABLE "OrganizationSettings" ADD COLUMN     "defaultInterestPeriod" "InterestPeriod" NOT NULL DEFAULT 'MONTHLY';

-- AlterTable
ALTER TABLE "PromissoryNote" ADD COLUMN     "interestPeriod" "InterestPeriod" NOT NULL DEFAULT 'ANNUAL';
