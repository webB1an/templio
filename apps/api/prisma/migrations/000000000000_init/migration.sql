-- CreateTable
CREATE TABLE `User` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `openid` VARCHAR(64) NOT NULL,
    `unionid` VARCHAR(64) NULL,
    `nickname` VARCHAR(64) NULL,
    `avatarUrl` VARCHAR(512) NULL,
    `status` ENUM('active', 'banned') NOT NULL DEFAULT 'active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_openid_key`(`openid`),
    INDEX `User_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Template` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(128) NOT NULL,
    `summary` VARCHAR(512) NULL,
    `cover` VARCHAR(512) NULL,
    `format` ENUM('ppt', 'word', 'excel', 'pdf', 'image', 'archive', 'other') NOT NULL DEFAULT 'other',
    `status` ENUM('draft', 'pending_review', 'rejected', 'published', 'offline', 'banned') NOT NULL DEFAULT 'draft',
    `copyrightSource` VARCHAR(256) NULL,
    `authorizationNote` VARCHAR(512) NULL,
    `baseCreditPrice` INTEGER NOT NULL DEFAULT 0,
    `viewCount` INTEGER NOT NULL DEFAULT 0,
    `favoriteCount` INTEGER NOT NULL DEFAULT 0,
    `shareOpenCount` INTEGER NOT NULL DEFAULT 0,
    `heatScore` DOUBLE NOT NULL DEFAULT 0,
    `rejectReason` VARCHAR(256) NULL,
    `publishedAt` DATETIME(3) NULL,
    `meta` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Template_status_publishedAt_idx`(`status`, `publishedAt`),
    INDEX `Template_status_heatScore_idx`(`status`, `heatScore`),
    INDEX `Template_format_idx`(`format`),
    INDEX `Template_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TemplateFile` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `templateId` INTEGER NOT NULL,
    `filename` VARCHAR(256) NOT NULL,
    `format` ENUM('ppt', 'word', 'excel', 'pdf', 'image', 'archive', 'other') NOT NULL DEFAULT 'other',
    `size` BIGINT NULL,
    `netdiskType` ENUM('quark', 'baidu') NOT NULL,
    `netdiskFileId` VARCHAR(128) NULL,
    `previewUrl` VARCHAR(512) NULL,
    `shareUrl` VARCHAR(1024) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TemplateFile_templateId_idx`(`templateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Category` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `dimension` ENUM('format', 'scene', 'audience', 'theme') NOT NULL,
    `parentId` INTEGER NULL,
    `name` VARCHAR(64) NOT NULL,
    `slug` VARCHAR(64) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Category_parentId_idx`(`parentId`),
    UNIQUE INDEX `Category_dimension_slug_key`(`dimension`, `slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tag` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(64) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Tag_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TemplateCategory` (
    `templateId` INTEGER NOT NULL,
    `categoryId` INTEGER NOT NULL,

    INDEX `TemplateCategory_categoryId_idx`(`categoryId`),
    PRIMARY KEY (`templateId`, `categoryId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TemplateTag` (
    `templateId` INTEGER NOT NULL,
    `tagId` INTEGER NOT NULL,

    INDEX `TemplateTag_tagId_idx`(`tagId`),
    PRIMARY KEY (`templateId`, `tagId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Favorite` (
    `userId` INTEGER NOT NULL,
    `templateId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Favorite_templateId_idx`(`templateId`),
    PRIMARY KEY (`userId`, `templateId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ViewHistory` (
    `userId` INTEGER NOT NULL,
    `templateId` INTEGER NOT NULL,
    `lastViewedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ViewHistory_userId_lastViewedAt_idx`(`userId`, `lastViewedAt`),
    PRIMARY KEY (`userId`, `templateId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CreditAccount` (
    `userId` INTEGER NOT NULL,
    `balance` INTEGER NOT NULL DEFAULT 0,
    `version` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`userId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CreditLedger` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `type` ENUM('recharge', 'gift', 'checkin', 'share_reward', 'unlock_deduct', 'admin_adjust', 'refund_deduct') NOT NULL,
    `amount` INTEGER NOT NULL,
    `balanceAfter` INTEGER NOT NULL,
    `idempotentKey` VARCHAR(128) NOT NULL,
    `reason` VARCHAR(256) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CreditLedger_idempotentKey_key`(`idempotentKey`),
    INDEX `CreditLedger_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `CreditLedger_type_createdAt_idx`(`type`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CheckinRecord` (
    `userId` INTEGER NOT NULL,
    `date` DATE NOT NULL,
    `reward` INTEGER NOT NULL DEFAULT 0,
    `streakDays` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `CheckinRecord_date_idx`(`date`),
    PRIMARY KEY (`userId`, `date`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ShareReward` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sharerId` INTEGER NOT NULL,
    `receiverId` INTEGER NOT NULL,
    `templateId` INTEGER NOT NULL,
    `reward` INTEGER NOT NULL DEFAULT 0,
    `ledgerKey` VARCHAR(128) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ShareReward_receiverId_idx`(`receiverId`),
    INDEX `ShareReward_templateId_idx`(`templateId`),
    UNIQUE INDEX `ShareReward_sharerId_templateId_key`(`sharerId`, `templateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentSku` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `skuKey` VARCHAR(64) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `description` VARCHAR(256) NULL,
    `wxProductId` VARCHAR(128) NOT NULL,
    `wxPriceFen` INTEGER NOT NULL,
    `credits` INTEGER NOT NULL,
    `bonusCredits` INTEGER NOT NULL DEFAULT 0,
    `badgeText` VARCHAR(32) NULL,
    `activityNote` VARCHAR(128) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `verified` BOOLEAN NOT NULL DEFAULT false,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentSku_skuKey_key`(`skuKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PaymentOrder` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `orderNo` VARCHAR(64) NOT NULL,
    `userId` INTEGER NOT NULL,
    `openid` VARCHAR(64) NOT NULL,
    `skuKey` VARCHAR(64) NOT NULL,
    `skuSnapshot` JSON NOT NULL,
    `amountFen` INTEGER NOT NULL,
    `creditsSnapshot` INTEGER NOT NULL,
    `status` ENUM('created', 'paid', 'closed', 'refunded') NOT NULL DEFAULT 'created',
    `platformTxnId` VARCHAR(128) NULL,
    `notifyPayload` JSON NULL,
    `notifiedAt` DATETIME(3) NULL,
    `paidAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PaymentOrder_orderNo_key`(`orderNo`),
    UNIQUE INDEX `PaymentOrder_platformTxnId_key`(`platformTxnId`),
    INDEX `PaymentOrder_userId_createdAt_idx`(`userId`, `createdAt`),
    INDEX `PaymentOrder_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TemplateUnlock` (
    `userId` INTEGER NOT NULL,
    `templateId` INTEGER NOT NULL,
    `creditsSnapshot` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `TemplateUnlock_templateId_idx`(`templateId`),
    PRIMARY KEY (`userId`, `templateId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Feedback` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NULL,
    `type` VARCHAR(32) NOT NULL,
    `content` VARCHAR(1024) NOT NULL,
    `contact` VARCHAR(128) NULL,
    `images` JSON NULL,
    `status` ENUM('pending', 'resolved') NOT NULL DEFAULT 'pending',
    `reply` VARCHAR(1024) NULL,
    `handledBy` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Feedback_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Announcement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(128) NOT NULL,
    `content` TEXT NOT NULL,
    `position` ENUM('home', 'mine') NOT NULL DEFAULT 'home',
    `startAt` DATETIME(3) NULL,
    `endAt` DATETIME(3) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Announcement_enabled_position_sort_idx`(`enabled`, `position`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SearchKeywordStat` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `keyword` VARCHAR(64) NOT NULL,
    `count7d` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `SearchKeywordStat_keyword_key`(`keyword`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UploadBatch` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `operatorId` INTEGER NULL,
    `source` ENUM('local', 'netdisk', 'link') NOT NULL DEFAULT 'local',
    `status` VARCHAR(32) NOT NULL DEFAULT 'processing',
    `remark` VARCHAR(256) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `UploadBatch_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProcessingTask` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('ai_classify', 'thumbnail', 'link_check', 'heat_score') NOT NULL,
    `status` ENUM('queued', 'running', 'succeeded', 'failed', 'retry_waiting') NOT NULL DEFAULT 'queued',
    `batchId` INTEGER NULL,
    `templateId` INTEGER NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `maxAttempts` INTEGER NOT NULL DEFAULT 5,
    `idempotentKey` VARCHAR(128) NOT NULL,
    `payload` JSON NULL,
    `error` VARCHAR(1024) NULL,
    `nextRunAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ProcessingTask_idempotentKey_key`(`idempotentKey`),
    INDEX `ProcessingTask_status_nextRunAt_idx`(`status`, `nextRunAt`),
    INDEX `ProcessingTask_type_status_idx`(`type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ReviewRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `templateId` INTEGER NOT NULL,
    `adminId` INTEGER NOT NULL,
    `action` VARCHAR(32) NOT NULL,
    `note` VARCHAR(512) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `ReviewRecord_templateId_createdAt_idx`(`templateId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Complaint` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `templateId` INTEGER NOT NULL,
    `type` ENUM('copyright', 'violation', 'other') NOT NULL,
    `reporterName` VARCHAR(64) NULL,
    `contact` VARCHAR(128) NULL,
    `content` VARCHAR(2048) NOT NULL,
    `evidence` JSON NULL,
    `status` ENUM('pending', 'processing', 'resolved', 'rejected') NOT NULL DEFAULT 'pending',
    `handledBy` INTEGER NULL,
    `resolution` VARCHAR(1024) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Complaint_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `Complaint_templateId_idx`(`templateId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminUser` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(64) NOT NULL,
    `passwordHash` VARCHAR(128) NOT NULL,
    `role` ENUM('super', 'operator') NOT NULL DEFAULT 'operator',
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `lastLoginAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AdminUser_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AdminAuditLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `adminId` INTEGER NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `targetType` VARCHAR(32) NOT NULL,
    `targetId` VARCHAR(64) NULL,
    `summary` VARCHAR(1024) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `AdminAuditLog_adminId_createdAt_idx`(`adminId`, `createdAt`),
    INDEX `AdminAuditLog_targetType_targetId_idx`(`targetType`, `targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemConfig` (
    `key` VARCHAR(64) NOT NULL,
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Banner` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `image` VARCHAR(512) NOT NULL,
    `linkType` ENUM('none', 'template', 'category', 'url') NOT NULL DEFAULT 'none',
    `linkTarget` VARCHAR(128) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `startAt` DATETIME(3) NULL,
    `endAt` DATETIME(3) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Banner_enabled_sort_idx`(`enabled`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TemplateFile` ADD CONSTRAINT `TemplateFile_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Category` ADD CONSTRAINT `Category_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `Category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateCategory` ADD CONSTRAINT `TemplateCategory_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateCategory` ADD CONSTRAINT `TemplateCategory_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `Category`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateTag` ADD CONSTRAINT `TemplateTag_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateTag` ADD CONSTRAINT `TemplateTag_tagId_fkey` FOREIGN KEY (`tagId`) REFERENCES `Tag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Favorite` ADD CONSTRAINT `Favorite_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Favorite` ADD CONSTRAINT `Favorite_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ViewHistory` ADD CONSTRAINT `ViewHistory_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ViewHistory` ADD CONSTRAINT `ViewHistory_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditAccount` ADD CONSTRAINT `CreditAccount_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CreditLedger` ADD CONSTRAINT `CreditLedger_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CheckinRecord` ADD CONSTRAINT `CheckinRecord_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShareReward` ADD CONSTRAINT `ShareReward_sharerId_fkey` FOREIGN KEY (`sharerId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShareReward` ADD CONSTRAINT `ShareReward_receiverId_fkey` FOREIGN KEY (`receiverId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ShareReward` ADD CONSTRAINT `ShareReward_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentOrder` ADD CONSTRAINT `PaymentOrder_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PaymentOrder` ADD CONSTRAINT `PaymentOrder_skuKey_fkey` FOREIGN KEY (`skuKey`) REFERENCES `PaymentSku`(`skuKey`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateUnlock` ADD CONSTRAINT `TemplateUnlock_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateUnlock` ADD CONSTRAINT `TemplateUnlock_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Feedback` ADD CONSTRAINT `Feedback_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProcessingTask` ADD CONSTRAINT `ProcessingTask_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `UploadBatch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProcessingTask` ADD CONSTRAINT `ProcessingTask_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewRecord` ADD CONSTRAINT `ReviewRecord_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ReviewRecord` ADD CONSTRAINT `ReviewRecord_adminId_fkey` FOREIGN KEY (`adminId`) REFERENCES `AdminUser`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Complaint` ADD CONSTRAINT `Complaint_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Template`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

