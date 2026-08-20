import { fromMarkdown } from "mdast-util-from-markdown";
import { toString } from "mdast-util-to-string";
import type { Nodes, Parents, RootContent } from "mdast";

/**
 * Markdown -> readable prose, for reading time and word count.
 *
 * The counts are shown to readers, so anything they never read has to go:
 * code blocks, raw HTML, link reference definitions, and bare URLs. A weibo
 * post carries several hundred characters of tracking URL per topic, which
 * would otherwise dominate its word count.
 *
 * Only this module talks to the markdown AST; callers stay on plain strings.
 */

// Bare URLs survive as plain text: link destinations are already dropped by the
// AST, but autolink literals are not parsed without the GFM extension. Stripped
// per text node, not on the joined output: toString concatenates without any
// separator, so `\S+` would run past the URL and eat the next block's prose.
const BARE_URL = /https?:\/\/\S+/g;

// Literal nodes whose value is markup or machinery rather than prose.
const SKIPPED_NODES = new Set([
  "code",
  "inlineCode",
  "html",
  "yaml",
  "definition",
]);

function isParent(node: Nodes): node is Parents {
  return "children" in node;
}

function pruneNode(node: RootContent): RootContent | undefined {
  if (SKIPPED_NODES.has(node.type)) return undefined;
  if (node.type === "text")
    return { ...node, value: node.value.replace(BARE_URL, " ") };
  if (!isParent(node)) return node;
  return { ...node, children: pruneChildren(node.children) } as RootContent;
}

function pruneChildren(children: RootContent[]): RootContent[] {
  return children
    .map(pruneNode)
    .filter((child): child is RootContent => child !== undefined);
}

export function toPlainText(body: string): string {
  const tree = fromMarkdown(body ?? "");
  // Block by block: toString glues its input together with nothing in between,
  // which would fuse the last word of one paragraph onto the first of the next.
  return pruneChildren(tree.children)
    .map(node => toString(node))
    .join("\n");
}

const CJK = /[一-鿿぀-ヿㇰ-ㇿ가-힯]/g;

/**
 * Count CJK characters and Latin words separately: a whitespace split badly
 * undercounts Chinese/Japanese/Korean text, and CJK convention counts
 * characters rather than segmented words.
 */
export function countProse(plainText: string): {
  cjkChars: number;
  words: number;
} {
  const cjkChars = (plainText.match(CJK) || []).length;
  const words = (plainText.replace(CJK, " ").match(/[A-Za-z0-9]+/g) || [])
    .length;
  return { cjkChars, words };
}
