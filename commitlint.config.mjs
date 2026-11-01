export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // 标题不超过 100 字符（中文按字符计）
    "header-max-length": [2, "always", 100],
    // 正文每行不超过 200 字符（中文提交正文较宽）
    "body-max-line-length": [1, "always", 200],
    // 允许中文标题，不做大小写限制
    "subject-case": [0],
  },
};
