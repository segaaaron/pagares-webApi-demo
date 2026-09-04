-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "appVersion" TEXT,
ADD COLUMN     "deviceModel" TEXT,
ADD COLUMN     "osVersion" TEXT,
ADD COLUMN     "platform" TEXT;
