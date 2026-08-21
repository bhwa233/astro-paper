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
  return `${service.turndown(node).trim()}\n`;
}
