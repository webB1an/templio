-- 网盘账号表：管理端维护夸克/百度多账号授权态
CREATE TABLE `StorageAccount` (
    `id` VARCHAR(32) NOT NULL,
    `provider` ENUM('quark', 'baidu') NOT NULL,
    `label` VARCHAR(64) NOT NULL,
    `profileDir` VARCHAR(512) NOT NULL,
    `configPath` VARCHAR(512) NULL,
    `accountName` VARCHAR(128) NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastProbeOk` BOOLEAN NULL,
    `lastProbeMessage` TEXT NULL,
    `lastProbeAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `StorageAccount_provider_isDefault_idx`(`provider`, `isDefault`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
