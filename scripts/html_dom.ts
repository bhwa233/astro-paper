// jsdom 的唯一封装点。业务脚本一律从这里取 Document，不直接 import jsdom：
// 换解析器、统一 base URL 与 contentType、加统一的解析错误处理时，改动面就是这一个文件。
import { JSDOM } from "jsdom";

/** 解析 HTML 文档。传 url 时相对链接会按它解析成绝对地址。 */
export function parseHtml(html: string, url?: string): Document {
  return new JSDOM(html, url ? { url } : {}).window.document;
}

/** 解析 XML（RSS / Atom）。走 XML 模式，标签大小写与命名空间前缀才会被保留。 */
export function parseXml(xml: string): Document {
  return new JSDOM(xml, { contentType: "text/xml" }).window.document;
}
