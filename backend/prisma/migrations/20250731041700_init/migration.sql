-- CreateTable
CREATE TABLE "public"."User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."File" (
    "id" SERIAL NOT NULL,
    "filename" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Metadata" (
    "id" SERIAL NOT NULL,
    "fileId" INTEGER NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "Metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Metadata_fileId_key" ON "public"."Metadata"("fileId");

-- AddForeignKey
ALTER TABLE "public"."File" ADD CONSTRAINT "File_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Metadata" ADD CONSTRAINT "Metadata_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "public"."File"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
