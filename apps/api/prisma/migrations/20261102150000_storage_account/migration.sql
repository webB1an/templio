-- 网盘账号：管理端在线绑定百度/夸克账号并设置默认账号
CREATE TABLE `StorageAccount` (
    `id` VARCHAR(191) NOT NULL,
    `provider` ENUM('baidu', 'quark') NOT NULL,
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
    INDEX `StorageAccount_provider_isActive_idx`(`provider`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
