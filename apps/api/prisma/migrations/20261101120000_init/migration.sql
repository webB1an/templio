-- CreateTable
CREATE TABLE `Template` (
    `id` VARCHAR(191) NOT NULL,
    `sourceHash` CHAR(64) NOT NULL,
    `title` VARCHAR(200) NULL,
    `subtitle` VARCHAR(200) NULL,
    `description` TEXT NULL,
    `status` ENUM('draft', 'imported', 'ai_processing', 'pending_review', 'published', 'rejected', 'archived', 'failed') NOT NULL DEFAULT 'draft',
    `categoryId` VARCHAR(191) NULL,
    `format` VARCHAR(16) NULL,
    `pageCount` INTEGER NULL,
    `fileSize` BIGINT NULL,
    `originalName` VARCHAR(255) NULL,
    `batchKey` VARCHAR(64) NULL,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `copyCount` INTEGER NOT NULL DEFAULT 0,
    `favoriteCount` INTEGER NOT NULL DEFAULT 0,
    `publishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Template_sourceHash_key`(`sourceHash`),
    INDEX `Template_status_publishedAt_idx`(`status`, `publishedAt`),
    INDEX `Template_categoryId_status_idx`(`categoryId`, `status`),
    INDEX `Template_batchKey_idx`(`batchKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TemplateFile` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `role` ENUM('source', 'preview', 'thumb', 'cover') NOT NULL,
    `objectKey` VARCHAR(512) NOT NULL,
    `mime` VARCHAR(100) NULL,
    `size` BIGINT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `seq` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TemplateFile_templateId_role_seq_idx`(`templateId`, `role`, `seq`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` VARCHAR(191) NOT NULL,
    `parentId` VARCHAR(191) NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `icon` VARCHAR(255) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Category_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tag` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `type` VARCHAR(20) NOT NULL DEFAULT 'style',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Tag_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TemplateTag` (
    `templateId` VARCHAR(191) NOT NULL,
    `tagId` VARCHAR(191) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`templateId`, `tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `NetdiskLink` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `provider` ENUM('baidu', 'quark') NOT NULL,
    `storageAccountId` VARCHAR(191) NULL,
    `url` TEXT NOT NULL,
    `passcode` VARCHAR(32) NULL,
    `remotePath` VARCHAR(512) NULL,
    `remoteFileId` VARCHAR(128) NULL,
    `status` ENUM('pending', 'synced', 'invalid') NOT NULL DEFAULT 'pending',
    `isPrimary` BOOLEAN NOT NULL DEFAULT false,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `lastCheckedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `NetdiskLink_templateId_provider_idx`(`templateId`, `provider`),
    INDEX `NetdiskLink_status_isActive_idx`(`status`, `isActive`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShortLink` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `netdiskLinkId` VARCHAR(191) NOT NULL,
    `provider` ENUM('baidu', 'quark') NOT NULL,
    `clickCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ShortLink_code_key`(`code`),
    INDEX `ShortLink_templateId_idx`(`templateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AiAnalysis` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(200) NULL,
    `subtitle` VARCHAR(200) NULL,
    `categoryKey` VARCHAR(100) NULL,
    `tags` JSON NULL,
    `audience` VARCHAR(50) NULL,
    `style` VARCHAR(50) NULL,
    `summary` TEXT NULL,
    `confidence` DOUBLE NULL,
    `safe` BOOLEAN NOT NULL DEFAULT true,
    `flags` JSON NULL,
    `needsReview` BOOLEAN NOT NULL DEFAULT true,
    `raw` JSON NULL,
    `model` VARCHAR(100) NULL,
    `promptVersion` VARCHAR(50) NULL,
    `inputTokens` INTEGER NULL,
    `outputTokens` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `AiAnalysis_templateId_key`(`templateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Task` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NULL,
    `type` ENUM('netdisk_sync', 'ai_classify') NOT NULL,
    `status` ENUM('queued', 'running', 'success', 'failed', 'skipped') NOT NULL DEFAULT 'queued',
    `progress` INTEGER NOT NULL DEFAULT 0,
    `message` TEXT NULL,
    `payload` JSON NULL,
    `result` JSON NULL,
    `error` TEXT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Task_type_status_idx`(`type`, `status`),
    INDEX `Task_templateId_idx`(`templateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `key` VARCHAR(100) NOT NULL,
    `value` JSON NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `openid` VARCHAR(64) NOT NULL,
    `nickname` VARCHAR(100) NULL,
    `avatar` VARCHAR(500) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `User_openid_key`(`openid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UserFavorite` (
    `userId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`userId`, `templateId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TemplateClick` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(20) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TemplateClick_templateId_kind_createdAt_idx`(`templateId`, `kind`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Template` ADD CONSTRAINT `Template_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateFile` ADD CONSTRAINT `TemplateFile_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateTag` ADD CONSTRAINT `TemplateTag_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateTag` ADD CONSTRAINT `TemplateTag_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `NetdiskLink` ADD CONSTRAINT `NetdiskLink_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShortLink` ADD CONSTRAINT `ShortLink_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShortLink` ADD CONSTRAINT `ShortLink_netdiskLinkId_fkey` FOREIGN KEY (`netdiskLinkId`) REFERENCES `NetdiskLink`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AiAnalysis` ADD CONSTRAINT `AiAnalysis_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserFavorite` ADD CONSTRAINT `UserFavorite_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UserFavorite` ADD CONSTRAINT `UserFavorite_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateClick` ADD CONSTRAINT `TemplateClick_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

