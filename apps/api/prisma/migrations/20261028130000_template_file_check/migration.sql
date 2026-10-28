-- AlterTable
ALTER TABLE `templatefile` ADD COLUMN `checkAt` DATETIME(3) NULL,
    ADD COLUMN `checkMessage` VARCHAR(512) NULL,
    ADD COLUMN `checkStatus` VARCHAR(16) NULL;

