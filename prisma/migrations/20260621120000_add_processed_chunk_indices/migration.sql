-- AlterTable
ALTER TABLE "Transcript" ADD COLUMN IF NOT EXISTS "processedChunkIndices" TEXT NOT NULL DEFAULT '[]';
