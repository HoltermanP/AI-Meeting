-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "outlookEventId" TEXT,
ADD COLUMN     "teamsJoinUrl" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "msAccessToken" TEXT,
ADD COLUMN     "msRefreshToken" TEXT,
ADD COLUMN     "msTokenExpiresAt" TIMESTAMP(3);
