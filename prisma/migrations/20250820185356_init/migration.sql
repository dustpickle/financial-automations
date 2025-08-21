/*
  Warnings:

  - A unique constraint covering the columns `[name]` on the table `SftpAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "SftpAccount_name_key" ON "SftpAccount"("name");
