import assert from "node:assert/strict";
import test from "node:test";

import { collapseHanSpacing, spaceOutHan, toPagefindQuery } from "../src/utils/pagefindHan.ts";

// 这三个函数的失败是静默的：拆错了搜索只是查不到，没有任何一条 gate 会红。
const BODY = "9. 反向较劲法：使劲睁大双眼，拼尽全力试图保持清醒，通常不到五分钟眼皮就会沉重得抬不起来。";

test("索引侧拆出来的正文，包含查询侧拆出来的整串汉字短语", () => {
  const phrase = toPagefindQuery("拼尽全力试图保持清醒");

  assert.equal(phrase, '"拼 尽 全 力 试 图 保 持 清 醒"');
  assert.ok(spaceOutHan(BODY).includes(phrase.slice(1, -1)));
});

test("混合查询不加引号：pagefind 不支持多个引号短语相与", () => {
  assert.equal(toPagefindQuery("Claude 保持清醒"), "Claude 保 持 清 醒");
  assert.equal(toPagefindQuery("pagefind"), "pagefind");
});

test("展示侧跨 mark 收回字间空格，且不动汉字与 ASCII 之间的空格", () => {
  assert.equal(collapseHanSpacing("Reddit 每 日 精 选｜问 答 精 选"), "Reddit 每日精选｜问答精选");
  assert.equal(collapseHanSpacing("双 眼，<mark>拼 </mark><mark>尽 </mark>全 力"), "双眼，<mark>拼</mark><mark>尽</mark>全力");
});
