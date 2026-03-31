-- Voeg Clerk-koppeling op User opnieuw toe
ALTER TABLE "User" ADD COLUMN "clerkId" TEXT;

CREATE UNIQUE INDEX "User_clerkId_key" ON "User"("clerkId");
