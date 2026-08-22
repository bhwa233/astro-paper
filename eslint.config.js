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
  // astro-wechat 是克隆到工作区里的独立仓库，有自己的 lint 配置。
  {
    ignores: ["dist/**", ".astro/**", "public/pagefind/**", "astro-wechat/**"],
  },
];
