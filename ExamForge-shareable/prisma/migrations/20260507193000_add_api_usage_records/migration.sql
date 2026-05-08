-- CreateTable
CREATE TABLE "ApiUsageRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "courseId" TEXT,
    "examId" TEXT,
    "attemptId" TEXT,
    "requestKey" TEXT,
    "operationGroup" TEXT NOT NULL,
    "operationName" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "cachedInputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" REAL NOT NULL DEFAULT 0,
    "metadataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiUsageRecord_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApiUsageRecord_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ApiUsageRecord_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "ExamAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ApiUsageRecord_courseId_operationGroup_idx" ON "ApiUsageRecord"("courseId", "operationGroup");

-- CreateIndex
CREATE INDEX "ApiUsageRecord_examId_operationGroup_idx" ON "ApiUsageRecord"("examId", "operationGroup");

-- CreateIndex
CREATE INDEX "ApiUsageRecord_attemptId_operationGroup_idx" ON "ApiUsageRecord"("attemptId", "operationGroup");

-- CreateIndex
CREATE INDEX "ApiUsageRecord_requestKey_idx" ON "ApiUsageRecord"("requestKey");
