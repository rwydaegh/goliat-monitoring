-- CreateTable
CREATE TABLE "result_files" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "relativePath" TEXT NOT NULL,
    "fileData" BYTEA NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "result_files_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "result_files" ADD CONSTRAINT "result_files_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

