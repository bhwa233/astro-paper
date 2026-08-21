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

export function htmlNodeToMarkdown(
  node: HTMLElement | DocumentFragment
): string {
  const source = node.cloneNode(true) as HTMLElement | DocumentFragment;
  source.querySelectorAll("a[href]").forEach(anchor => {
    if (/!$/.test(anchor.previousSibling?.textContent || "")) {
      anchor.before(anchor.ownerDocument.createTextNode(" "));
    }
  });
  return `${service.turndown(source).trim()}\n`;
}
