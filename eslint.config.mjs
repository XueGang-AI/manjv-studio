import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  // 全局：下划线前缀的参数/变量视为有意未使用，不报警。
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  // preview/ 和 src/app/preview/ 是只读样板页面（见 .claude/rules/frontend.md），
  // 历史样板代码存在未使用变量，不在业务维护范围内，关闭相关检查避免噪音。
  // 放在全局配置之后以确保覆盖生效。
  {
    files: ["preview/**", "src/app/preview/**"],
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@next/next/no-img-element": "off",
      "react/no-unescaped-entities": "off",
      "jsx-a11y/alt-text": "off",
    },
  },
]);

export default eslintConfig;
