/**
 * 提交信息规范（Conventional Commits）
 * 格式：<type>(<scope>): <subject>
 *
 * type 说明：
 * - feat:     新功能
 * - fix:      缺陷修复
 * - docs:     文档变更
 * - style:    代码格式（不影响逻辑）
 * - refactor: 重构（既非新增也非修复）
 * - perf:     性能优化
 * - test:     测试相关
 * - build:    构建/依赖变更
 * - ci:       CI/CD 配置
 * - chore:    杂项（不修改 src 或测试）
 * - revert:   回滚提交
 *
 * scope 约定：api / admin / miniprogram / shared / prisma / infra
 */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'],
    ],
    'scope-enum': [
      1,
      'always',
      ['api', 'admin', 'miniprogram', 'mp', 'shared', 'prisma', 'infra', 'repo', 'deps'],
    ],
    'subject-max-length': [2, 'always', 72],
    'body-max-line-length': [1, 'always', 100],
  },
};
