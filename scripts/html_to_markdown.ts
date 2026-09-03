import TurndownService from "turndown";

const service = new TurndownService({
  headingStyle: "atx",
  bulletListMarker: "-",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
  strongDelimiter: "**",
  linkStyle: "inlined",
});

service.remove(["script", "style", "form", "button", "iframe", "noscript"]);

const HEADING_EMPHASIS_SELECTOR = ["h1", "h2", "h3", "h4", "h5", "h6"].flatMap(heading => [`${heading} strong`, `${heading} b`]).join(", ");

export function htmlNodeToMarkdown(node: HTMLElement | DocumentFragment): string {
  const source = node.cloneNode(true) as HTMLElement | DocumentFragment;
  // Substack 的标题多写成 <h2><strong>…</strong></h2>，直译成 `## **标题**` 后，
  // 公众号主题给 strong 上的品牌色会盖掉标题自身的反白色，深蓝字压深蓝底看不清。
  // 标题本来就是粗体，这层强调没有信息量，转换前直接拆掉。
  source.querySelectorAll(HEADING_EMPHASIS_SELECTOR).forEach(emphasis => emphasis.replaceWith(...emphasis.childNodes));
  source.querySelectorAll("a[href]").forEach(anchor => {
    if (/!$/.test(anchor.previousSibling?.textContent || "")) {
      anchor.before(anchor.ownerDocument.createTextNode(" "));
    }
  });
  return `${service.turndown(source).trim()}\n`;
}
