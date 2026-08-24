import eslintPluginAstro from "eslint-plugin-astro";
import tsParser from "@typescript-eslint/parser";

export default [
  ...eslintPluginAstro.configs.recommended,
  {
    files: ["**/*.astro"],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
      },
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
    },
  },
  { rules: { "no-console": "error" } },
  // scripts/wechat 是从独立仓库整棵搬进来的发布器，保留原有代码风格：它自带
  // 一个 CLI，stdout/stderr 就是它的产品，不走本仓 writeStdout/writeStderr 封装，
  // 因此全局的 no-console 在这里只会制造噪音。它也不在 .prettierignore 的白名单里，
  // 格式同样不归本仓管。
  {
    ignores: [
      "dist/**",
      ".astro/**",
      "public/pagefind/**",
      "scripts/wechat/**",
    ],
  },
];
