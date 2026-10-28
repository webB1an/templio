-- 模板文件记录网盘完整路径，用于回源下载与孤儿文件清理
ALTER TABLE `TemplateFile`
    ADD COLUMN `remotePath` VARCHAR(512) NULL;
