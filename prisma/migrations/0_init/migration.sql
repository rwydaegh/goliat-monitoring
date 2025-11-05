-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('IDLE', 'RUNNING', 'ERROR', 'OFFLINE');

-- CreateEnum
CREATE TYPE "StudyStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('STARTED', 'PROGRESS', 'STAGE_CHANGE', 'LOG', 'ERROR', 'FINISHED', 'ETA_UPDATE');

-- CreateTable
CREATE TABLE "workers" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "hostname" TEXT,
    "status" "WorkerStatus" NOT NULL DEFAULT 'IDLE',
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "machineLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "super_studies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baseConfigPath" TEXT,
    "status" "StudyStatus" NOT NULL DEFAULT 'PENDING',
    "totalAssignments" INTEGER NOT NULL DEFAULT 0,
    "completedAssignments" INTEGER NOT NULL DEFAULT 0,
    "masterProgress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "super_studies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "superStudyId" TEXT NOT NULL,
    "splitConfig" JSONB NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "currentStage" TEXT,
    "eta" TIMESTAMP(3),
    "resultData" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progress_events" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "eventType" "EventType" NOT NULL,
    "message" TEXT NOT NULL,
    "stage" TEXT,
    "progress" DOUBLE PRECISION,
    "eta" TIMESTAMP(3),
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "data" JSONB,

    CONSTRAINT "progress_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gui_state" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "progress" DOUBLE PRECISION NOT NULL,
    "logMessages" JSONB[] NOT NULL,
    "eta" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gui_state_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workers_ipAddress_key" ON "workers"("ipAddress");

-- CreateIndex
CREATE UNIQUE INDEX "gui_state_workerId_key" ON "gui_state"("workerId");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_superStudyId_fkey" FOREIGN KEY ("superStudyId") REFERENCES "super_studies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progress_events" ADD CONSTRAINT "progress_events_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gui_state" ADD CONSTRAINT "gui_state_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "workers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
