import { defineConfig } from "vitest/config";

// 只覆盖 scripts/wechat 子树。仓库其余部分的测试跑在 node --test 上
// （见 package.json 的 test:blog），两套测试运行器互不接管对方的文件。
export default defineConfig({
  test: {
    include: ["scripts/wechat/test/**/*.test.ts"],
    environment: "node",
  },
});
