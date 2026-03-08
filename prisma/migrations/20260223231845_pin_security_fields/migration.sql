-- AlterTable
ALTER TABLE "User" ADD COLUMN     "failedPinAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "pinLockedUntil" TIMESTAMP(3);
