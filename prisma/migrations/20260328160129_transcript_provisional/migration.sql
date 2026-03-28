-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Transcript" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "meetingId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "segments" TEXT NOT NULL,
    "isProvisional" BOOLEAN NOT NULL DEFAULT false,
    "language" TEXT NOT NULL DEFAULT 'en',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transcript_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Transcript" ("content", "createdAt", "id", "language", "meetingId", "segments", "updatedAt") SELECT "content", "createdAt", "id", "language", "meetingId", "segments", "updatedAt" FROM "Transcript";
DROP TABLE "Transcript";
ALTER TABLE "new_Transcript" RENAME TO "Transcript";
CREATE UNIQUE INDEX "Transcript_meetingId_key" ON "Transcript"("meetingId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
