-- 模板搜索：MySQL ngram 全文索引（title + summary）
ALTER TABLE `Template` ADD FULLTEXT INDEX `template_ft_title_summary` (`title`, `summary`) WITH PARSER `ngram`;
