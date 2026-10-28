-- 批量导入流水线：ProcessingTask 增加阶段进度字段与 import_pipeline 类型
ALTER TABLE `ProcessingTask`
    ADD COLUMN `stage` VARCHAR(32) NULL,
    ADD COLUMN `progress` INT NOT NULL DEFAULT 0,
    ADD COLUMN `message` VARCHAR(512) NULL;

ALTER TABLE `ProcessingTask`
    MODIFY COLUMN `type` ENUM('ai_classify', 'thumbnail', 'link_check', 'heat_score', 'import_pipeline') NOT NULL;
