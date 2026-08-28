import assert from "node:assert/strict";
import test from "node:test";
import { fitBalancedChineseTitle } from "../video/src/still/balancedTitle.ts";

test("balanced Chinese titles preserve word groups when wrapping", () => {
  const title = fitBalancedChineseTitle({
    text: "医护人员目睹患者遭遇后，果断放弃了哪些看似“正常”的生活习惯？",
    width: 720,
    height: 620,
    lineHeight: 1.24,
    min: 56,
    max: 92,
  });
  assert.ok(title.fontSize >= 56 && title.fontSize <= 92);
  assert.ok(title.lines.some(line => line.includes("患者")));
  assert.ok(title.lines.some(line => line.includes("放弃了")));
  assert.ok(title.lines.some(line => line.includes("“正常”的")));
  assert.ok(title.lines.some(line => line.includes("生活习惯？")));
  assert.equal(title.lines.join(""), "医护人员目睹患者遭遇后，果断放弃了哪些看似“正常”的生活习惯？");
});
