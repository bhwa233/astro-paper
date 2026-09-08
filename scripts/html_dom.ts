// HTML 解析的唯一封装点。业务脚本一律从这里取解析结果，不直接 import jsdom / cheerio：
// 换解析器、统一 base URL 与 contentType、加统一的解析错误处理时，改动面就是这一个文件。
//
// 这里有两个解析器，按用途分：
// - jsdom：需要完整 DOM 语义（querySelector 之外还要 window、相对链接解析）的单篇处理。
// - cheerio：整站批量改写。jsdom 跑全站 837 个页面要 27 秒、峰值 1.5 GB，不显式 close
//   还会直接 OOM；cheerio 同样的活 4 秒、峰值 202 MB。
import { JSDOM } from "jsdom";
import { load } from "cheerio";

/** 解析 HTML 文档。传 url 时相对链接会按它解析成绝对地址。 */
export function parseHtml(html: string, url?: string): Document {
  return new JSDOM(html, url ? { url } : {}).window.document;
}

/** 解析 XML（RSS / Atom）。走 XML 模式，标签大小写与命名空间前缀才会被保留。 */
export function parseXml(xml: string): Document {
  return new JSDOM(xml, { contentType: "text/xml" }).window.document;
}

/**
 * 用 transform 就地改写 selector 命中元素下的所有文本节点，返回改写后的整篇 HTML。
 * selector 没命中时返回 null，调用方据此判断这篇不用改。
 * skipSelector 命中的元素及其子树整棵跳过。
 */
export function rewriteTextInside(html: string, selector: string, transform: (text: string) => string, skipSelector?: string): string | null {
  const $ = load(html);
  const roots = $(selector);
  if (roots.length === 0) return null;

  roots
    .find("*")
    .addBack()
    .contents()
    .each((_, node) => {
      if (node.type !== "text") return;
      if (skipSelector && $(node).parent().closest(skipSelector).length > 0) return;
      node.data = transform(node.data);
    });

  return $.html();
}
