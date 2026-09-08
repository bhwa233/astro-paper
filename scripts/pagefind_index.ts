#!/usr/bin/env tsx
// 构建 pagefind 索引。不直接对 dist 建索引：每个可索引页面的正文汉字先在内存里拆成单字，
// 再经 pagefind 的 Node 索引 API 喂进去，最后把产物写到指定目录。
//
// 为什么要拆字，见 src/utils/pagefindHan.ts 顶部的说明。要点是服务出去的 HTML 保持原样——
// 拆字只是喂给索引器的形态，落盘的页面一个空格都不会多，所以这里走 addHTMLFile 而不是
// 让 pagefind 自己扫目录。
//
// 用法：pagefind_index.ts [--site dist] [--output dist/pagefind]
import fs from "node:fs";
import path from "node:path";
import { close, createIndex } from "pagefind";
import { rewriteTextInside } from "./html_dom.ts";
import { repoRoot, writeStdout } from "./blog_common.ts";
import { spaceOutHan } from "../src/utils/pagefindHan.ts";

// 代码块与脚本里的汉字不该被拆：拆了既污染索引，命中后摘要也读不成句。
// data-pagefind-ignore 是 pagefind 自己的排除标记，这里跟着一起跳过。
const SKIP_SELECTOR = "script, style, code, pre, [data-pagefind-ignore]";

// 一批同时在途的页面数。攒批是为了盖住跨进程往返的延迟，不是为了榨满 CPU。
const BATCH_SIZE = 64;

function argValue(flag: string, fallback: string): string {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : (process.argv[index + 1] ?? fallback);
}

function fail(errors: string[], step: string): void {
  if (errors.length) throw new Error(`pagefind ${step} 失败：${errors.join("; ")}`);
}

async function main(): Promise<void> {
  const root = repoRoot();
  const site = path.resolve(root, argValue("--site", "dist"));
  const output = path.resolve(root, argValue("--output", path.join("dist", "pagefind")));
  if (!fs.existsSync(site)) throw new Error(`站点目录不存在：${site}（先跑 astro build）`);

  const { errors, index } = await createIndex();
  fail(errors, "createIndex");
  if (!index) throw new Error("pagefind createIndex 没有返回索引");

  let spaced = 0;
  let asIs = 0;
  try {
    const files = fs
      .readdirSync(site, { recursive: true, withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith(".html"))
      .map(entry => path.join(entry.parentPath, entry.name));

    // addHTMLFile 每篇都是一次跨进程往返，串行喂 849 篇要 32 秒。
    // pagefind 的服务端本身能并发收，攒一批一起等就够了。
    for (let start = 0; start < files.length; start += BATCH_SIZE) {
      const batch = files.slice(start, start + BATCH_SIZE).map(file => {
        const html = fs.readFileSync(file, "utf8");
        // 没有 data-pagefind-body 的页面 pagefind 根本不收，原样交过去即可。
        const rewritten = html.includes("data-pagefind-body") ? rewriteTextInside(html, "[data-pagefind-body]", spaceOutHan, SKIP_SELECTOR) : null;
        if (rewritten === null) asIs++;
        else spaced++;
        return { file, content: rewritten ?? html, sourcePath: path.relative(site, file) };
      });
      const added = await Promise.all(batch.map(({ content, sourcePath }) => index.addHTMLFile({ sourcePath, content })));
      added.forEach((response, offset) => fail(response.errors, `addHTMLFile ${batch[offset]?.file}`));
    }

    writeStdout(`拆字页面 ${spaced} 个，原样收录 ${asIs} 个\n`);
    fail((await index.writeFiles({ outputPath: output })).errors, "writeFiles");
    writeStdout(`索引已写入 ${path.relative(root, output)}\n`);
  } finally {
    await close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
