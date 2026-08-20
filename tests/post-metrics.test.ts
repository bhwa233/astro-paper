// 文章页与卡片上那两个数字：分钟数和字数。两者都从同一份剥离后的正文来，
// 剥不干净就会被代码块和 URL 撑高——微博热搜一条话题链接就有几百字符。
import assert from "node:assert/strict";
import test from "node:test";

import { formatCompactCount } from "../src/utils/formatCompactCount.ts";
import { getPostMetrics } from "../src/utils/readingTime.ts";
import { toPlainText } from "../src/utils/postText.ts";

test("plain text keeps prose and drops everything readers never read", () => {
  const body = [
    "# 标题",
    "",
    "正文一句话，含 [链接文字](https://example.com/very/long/tracking/url?a=1&b=2) 与 `inlineCode`。",
    "",
    "```js",
    "const neverCounted = 1;",
    "```",
    "",
    "- **话题**：https://m.weibo.cn/search?containerid=100103type%3D1%26q%3D%23very-long%23",
    "",
    "<div data-raw-html>不该计入</div>",
  ].join("\n");

  const text = toPlainText(body);
  assert.match(text, /正文一句话/);
  assert.match(text, /链接文字/);
  assert.doesNotMatch(text, /neverCounted/);
  assert.doesNotMatch(text, /inlineCode/);
  assert.doesNotMatch(text, /https?:\/\//);
  assert.doesNotMatch(text, /data-raw-html/);
});

test("stripping a bare URL does not swallow the prose behind it", () => {
  // 归档前的微博格式：话题行是裸链接，摘要紧跟在下一个列表项。
  // toString 拼接时不插分隔符，按整串替换会让 \S+ 越过 URL 吃掉后面的摘要。
  const body = [
    "1. 🔴 某地通报某事件",
    "",
    "- 话题：https://m.weibo.cn/search?containerid=100103type%3D1%26q%3D%23topic%23&extparam=seat%3D1",
    "- 摘要：通报显示事件发生于上月，涉事人员已被免职。",
  ].join("\n");

  const text = toPlainText(body);
  assert.doesNotMatch(text, /https?:\/\//);
  assert.match(text, /通报显示事件发生于上月，涉事人员已被免职。/);
});

test("post metrics count CJK characters and Latin words off the same prose", () => {
  const cjk = "中".repeat(800);
  const latin = Array.from({ length: 200 }, (_, index) => `word${index}`).join(" ");

  // 800 CJK / 400 = 2 分钟；200 词 / 200 = 1 分钟。
  const metrics = getPostMetrics(`${cjk}\n\n${latin}\n`);
  assert.equal(metrics.readingTime, 3);
  assert.equal(metrics.wordCount, 1000);

  // 同一段正文外面套代码块，两个数字都不该动。
  const withCode = `${cjk}\n\n${latin}\n\n\`\`\`ts\n${"const padding = 1;\n".repeat(50)}\`\`\`\n`;
  assert.deepEqual(getPostMetrics(withCode), metrics);
});

test("empty and whitespace bodies still report one minute", () => {
  assert.deepEqual(getPostMetrics(""), { readingTime: 1, wordCount: 0 });
  assert.deepEqual(getPostMetrics("\n\n"), { readingTime: 1, wordCount: 0 });
});

test("compact counts switch to k at one thousand", () => {
  assert.equal(formatCompactCount(0), "0");
  assert.equal(formatCompactCount(999), "999");
  assert.equal(formatCompactCount(1000), "1k");
  assert.equal(formatCompactCount(5432), "5.4k");
  assert.equal(formatCompactCount(12000), "12k");
});
