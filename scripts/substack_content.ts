import { createHash } from "node:crypto";
import { fromMarkdown } from "mdast-util-from-markdown";
import { toString } from "mdast-util-to-string";
import { compact } from "./blog_common.ts";
import { parseHtml } from "./html_dom.ts";
import { htmlNodeToMarkdown } from "./html_to_markdown.ts";
import { compilePatterns } from "./substack_publications.ts";
import {
  SUBSTACK_LIMITS,
  translationResponseSchema,
  type NewsletterPublication,
  type TranslationResponse,
} from "./substack_contracts.ts";
import { validSubstackDescription } from "./substack_quality.ts";

export const SUBSTACK_PROMPT_VERSION = "substack-translation-v2";

export type SourceBlock = {
  id: string;
  kind: string;
  markdown: string;
  placeholders: string[];
  structure: string;
  mayDropPromo: boolean;
};

export type PreparedArticle = {
  cleanedHtml: string;
  markdown: string;
  blocks: SourceBlock[];
  sourceSha256: string;
  audit: {
    textRatio: number;
    headings: number;
    headingLevels: number[];
    links: number;
    images: number;
    listItems: number;
  };
};

type MdNode = {
  type?: string;
  depth?: number;
  ordered?: boolean;
  url?: string;
  value?: string;
  children?: MdNode[];
  position?: { start?: { offset?: number }; end?: { offset?: number } };
};

function walk(node: MdNode, visit: (node: MdNode) => void): void {
  visit(node);
  for (const child of node.children || []) walk(child, visit);
}

function markdownMetrics(markdown: string): {
  text: string;
  headingLevels: number[];
  links: number;
  linkUrls: string[];
  images: number;
  listItems: number;
} {
  const tree = fromMarkdown(markdown) as MdNode;
  const metrics = {
    text: compact(toString(tree as Parameters<typeof toString>[0])),
    headingLevels: [] as number[],
    links: 0,
    linkUrls: [] as string[],
    images: 0,
    listItems: 0,
  };
  walk(tree, node => {
    if (node.type === "heading" && node.depth)
      metrics.headingLevels.push(node.depth);
    if (node.type === "link") {
      metrics.links += 1;
      if (node.url) metrics.linkUrls.push(node.url);
    }
    if (node.type === "image") metrics.images += 1;
    if (node.type === "listItem") metrics.listItems += 1;
  });
  return metrics;
}

function htmlMetrics(root: ParentNode): {
  text: string;
  headingLevels: number[];
  links: number;
  linkUrls: string[];
  images: number;
  listItems: number;
} {
  const links = [...root.querySelectorAll("a[href]")];
  return {
    text: compact(root.textContent || ""),
    headingLevels: [...root.querySelectorAll("h1,h2,h3,h4,h5,h6")].map(node =>
      Number(node.tagName.slice(1))
    ),
    links: links.length,
    linkUrls: links.map(node => node.getAttribute("href") || ""),
    images: root.querySelectorAll("img[src]").length,
    listItems: root.querySelectorAll("li").length,
  };
}

function applyCuts(
  body: HTMLElement,
  publication: NewsletterPublication
): void {
  const before = compilePatterns(publication.cutBeforePatterns);
  const after = compilePatterns(publication.cutAfterPatterns);
  const children = [...body.children];
  const beforeIndex = children.findIndex(child =>
    before.some(pattern => pattern.test(compact(child.textContent || "")))
  );
  const afterIndex = children.findIndex(child =>
    after.some(pattern => pattern.test(compact(child.textContent || "")))
  );
  const start = beforeIndex >= 0 ? beforeIndex + 1 : 0;
  const end = afterIndex >= 0 ? afterIndex : children.length;
  children.forEach((child, index) => {
    if (index < start || index >= end) child.remove();
  });
  // 中插的订阅 CTA 既不在头也不在尾，截断类规则一动就会砍掉正文，只能逐块删。
  const drop = compilePatterns(publication.dropPatterns);
  if (drop.length) {
    [...body.children].forEach(child => {
      if (drop.some(pattern => pattern.test(compact(child.textContent || ""))))
        child.remove();
    });
  }
  collapseThematicBreaks(body);
}

const GENERIC_PROMO_DROP_PATTERNS = [
  /^(?:please )?subscribe\b/i,
  /^become a paid subscriber\b/i,
  /^support (?:my|independent) (?:work|writing)\b/i,
  /^donating\s*=\s*loving$/i,
  /^forwarded this email\?\b/i,
  /^share this post\b/i,
];

const GENERIC_PROMO_REVIEW_PATTERN =
  /\b(?:subscribe|subscriber|newsletter|donat(?:e|ion)|paid member|support (?:my|our|independent) (?:work|writing)|share this post)\b/i;

function dropGenericPromoBlocks(body: HTMLElement): void {
  [...body.children].forEach(child => {
    const text = compact(child.textContent || "");
    if (
      text.length <= 500 &&
      GENERIC_PROMO_DROP_PATTERNS.some(pattern => pattern.test(text))
    )
      child.remove();
  });
  collapseThematicBreaks(body);
}

/** 删块之后常留下连排的分隔线。相邻的只保留一条，首尾的直接去掉。 */
function collapseThematicBreaks(body: HTMLElement): void {
  const children = [...body.children];
  const isRule = (node: Element): boolean =>
    !compact(node.textContent || "") &&
    (node.tagName === "HR" || Boolean(node.querySelector("hr")));
  let seenContent = false;
  let previousKeptIsRule = false;
  children.forEach((child, index) => {
    if (!isRule(child)) {
      seenContent = true;
      previousKeptIsRule = false;
      return;
    }
    const contentFollows = children
      .slice(index + 1)
      .some(node => !isRule(node) && Boolean(compact(node.textContent || "")));
    if (!seenContent || !contentFollows || previousKeptIsRule) {
      child.remove();
      return;
    }
    previousKeptIsRule = true;
  });
}

/**
 * Substack 的 @提及 在 RSS 里是空 span，名字只存在于 data-attrs 的 JSON 里，客户端才渲染。
 * 不还原就会留下「参见 的《……》」这种缺主语的残句，而且译文里看不出少了东西。
 */
function restoreMentions(body: HTMLElement): void {
  body
    .querySelectorAll('span[data-component-name="MentionToDOM"]')
    .forEach(node => {
      if (compact(node.textContent || "")) return;
      const raw = node.getAttribute("data-attrs") || "";
      if (!raw) return;
      try {
        const name = compact(String(JSON.parse(raw)?.name || ""));
        if (name) node.textContent = name;
      } catch {
        // data-attrs 不是合法 JSON 就当没有提及，交给下一步按空节点处理。
      }
    });
}

function cleanHtml(
  html: string,
  canonicalUrl: string,
  publication: NewsletterPublication
): HTMLElement {
  const document = parseHtml(`<body>${html}</body>`, canonicalUrl);
  const body = document.body;
  body
    .querySelectorAll(
      "script,style,noscript,iframe,object,embed,form,input,button,template,svg"
    )
    .forEach(node => node.remove());
  for (const selector of publication.removeSelectors) {
    try {
      body.querySelectorAll(selector).forEach(node => node.remove());
    } catch (error) {
      throw new Error(
        `invalid removeSelector for ${publication.key}: ${selector}: ${String(error)}`
      );
    }
  }
  restoreMentions(body);
  applyCuts(body, publication);
  dropGenericPromoBlocks(body);
  body.querySelectorAll("a[href],img[src]").forEach(node => {
    const attribute = node.tagName === "A" ? "href" : "src";
    const raw = node.getAttribute(attribute) || "";
    try {
      const resolved = new URL(raw, canonicalUrl);
      if (resolved.protocol !== "https:") node.removeAttribute(attribute);
      else node.setAttribute(attribute, resolved.href);
    } catch {
      node.removeAttribute(attribute);
    }
  });
  // Turndown inserts blank lines for block wrappers inside anchors, producing
  // invalid Markdown links. Flatten image-only anchors while preserving both URLs.
  body.querySelectorAll("a[href]").forEach(node => {
    const images = node.querySelectorAll("img[src]");
    if (images.length === 1 && !compact(node.textContent || ""))
      node.replaceChildren(images[0]);
  });
  if (publication.imagePolicy === "none")
    body.querySelectorAll("img,picture,figure").forEach(node => node.remove());
  return body;
}

function structureSignature(markdown: string): string {
  const tree = fromMarkdown(markdown) as MdNode;
  const signature: string[] = [];
  walk(tree, node => {
    if (node.type === "heading") signature.push(`h${node.depth}`);
    if (node.type === "list") signature.push(node.ordered ? "ol" : "ul");
    if (node.type === "listItem") signature.push("li");
    if (node.type === "blockquote") signature.push("quote");
    if (node.type === "code") signature.push("code");
  });
  return signature.join(",");
}

function protectUrls(
  markdown: string,
  blockIndex: number
): { markdown: string; placeholders: string[] } {
  const placeholders: string[] = [];
  const protectedMarkdown = markdown.replace(/https:\/\/[^\s)>]+/g, url => {
    const punctuation = url.match(/[.,;:!?]+$/)?.[0] || "";
    const cleanUrl = punctuation ? url.slice(0, -punctuation.length) : url;
    const placeholder = `URL_${String(blockIndex + 1).padStart(4, "0")}_${String(placeholders.length + 1).padStart(3, "0")}`;
    placeholders.push(`${placeholder}=${cleanUrl}`);
    return `${placeholder}${punctuation}`;
  });
  return { markdown: protectedMarkdown, placeholders };
}

function splitBlocks(markdown: string): SourceBlock[] {
  const tree = fromMarkdown(markdown) as MdNode;
  return (tree.children || []).map((node, index) => {
    const start = node.position?.start?.offset;
    const end = node.position?.end?.offset;
    if (start === undefined || end === undefined)
      throw new Error(`Markdown block ${index + 1} has no source offsets`);
    const source = markdown.slice(start, end);
    const protectedBlock = protectUrls(source, index);
    return {
      id: `b-${String(index + 1).padStart(4, "0")}`,
      kind: node.type || "unknown",
      markdown: protectedBlock.markdown,
      placeholders: protectedBlock.placeholders,
      structure: structureSignature(source),
      mayDropPromo:
        compact(toString(node as Parameters<typeof toString>[0])).length <=
          500 && GENERIC_PROMO_REVIEW_PATTERN.test(source),
    };
  });
}

export function prepareArticle(
  html: string,
  canonicalUrl: string,
  publication: NewsletterPublication
): PreparedArticle {
  if (
    /<(?:div|section|aside)\b[^>]*(?:class|data-component-name)=["'][^"']*(?:paywall|subscription-required)[^"']*["']/i.test(
      html
    )
  ) {
    throw new Error(
      "article contains a paywall marker; refusing partial subscriber content"
    );
  }
  const body = cleanHtml(html, canonicalUrl, publication);
  const sourceMetrics = htmlMetrics(body);
  const markdown = htmlNodeToMarkdown(body).trim();
  const convertedMetrics = markdownMetrics(markdown);
  const textRatio =
    convertedMetrics.text.length / Math.max(sourceMetrics.text.length, 1);
  for (const field of ["links", "images", "listItems"] as const) {
    if (sourceMetrics[field] !== convertedMetrics[field]) {
      const detail =
        field === "links"
          ? `; source=${JSON.stringify(sourceMetrics.linkUrls)} converted=${JSON.stringify(convertedMetrics.linkUrls)}`
          : "";
      throw new Error(
        `HTML to Markdown ${field} mismatch: ${sourceMetrics[field]} != ${convertedMetrics[field]}${detail}`
      );
    }
  }
  if (
    sourceMetrics.headingLevels.join(",") !==
    convertedMetrics.headingLevels.join(",")
  ) {
    throw new Error(
      `HTML to Markdown heading levels mismatch: ${sourceMetrics.headingLevels.join(",")} != ${convertedMetrics.headingLevels.join(",")}`
    );
  }
  if (textRatio < publication.extractionAudit.minTextRatio) {
    throw new Error(
      `HTML to Markdown text ratio ${textRatio.toFixed(3)} is below ${publication.extractionAudit.minTextRatio}`
    );
  }
  const blocks = splitBlocks(markdown);
  if (!blocks.length) throw new Error("article produced no Markdown blocks");
  return {
    cleanedHtml: body.innerHTML,
    markdown,
    blocks,
    sourceSha256: createHash("sha256").update(markdown).digest("hex"),
    audit: {
      textRatio,
      headings: convertedMetrics.headingLevels.length,
      headingLevels: convertedMetrics.headingLevels,
      links: convertedMetrics.links,
      images: convertedMetrics.images,
      listItems: convertedMetrics.listItems,
    },
  };
}

export function estimateTranslationTokens(
  blocks: readonly SourceBlock[]
): number {
  const text = JSON.stringify(blocks);
  const ascii = [...text].filter(char => char.codePointAt(0)! <= 0x7f).length;
  const nonAscii = [...text].length - ascii;
  const estimatedInput = Math.ceil(ascii / 4 + nonAscii / 1.5 + 1_200);
  const estimatedOutput = Math.ceil(((ascii + nonAscii) * 0.6) / 1.5 + 800);
  return estimatedInput + estimatedOutput;
}

export function buildTranslationPrompt(params: {
  publication: NewsletterPublication;
  sourceTitle: string;
  sourceAuthor: string;
  canonicalUrl: string;
  blocks: readonly SourceBlock[];
  instructions: string;
}): string {
  return `${params.instructions.trim()}\n\n${JSON.stringify({
    promptVersion: SUBSTACK_PROMPT_VERSION,
    publication: params.publication.displayName,
    sourceTitle: params.sourceTitle,
    sourceAuthor: params.sourceAuthor,
    canonicalUrl: params.canonicalUrl,
    blocks: params.blocks.map(block => ({
      id: block.id,
      kind: block.kind,
      markdown: block.markdown,
      mayDropPromo: block.mayDropPromo,
    })),
  })}`;
}

function placeholderNames(values: readonly string[]): string[] {
  return values.map(value => value.split("=", 1)[0]);
}

// 图片外层链接只用于 Substack 的点击放大，归档站有自己的 lightbox，因此只解开这一层。
const URL_PLACEHOLDER = String.raw`URL_\d{4}_\d{3}`;
// Substack 常把图片包在链接里做点击放大，折叠后要留下裸图片而不是把图片一起吃掉。
const LINKED_IMAGE = new RegExp(
  String.raw`\[(!\[[^\]]*\]\(${URL_PLACEHOLDER}\))\]\(${URL_PLACEHOLDER}\)`,
  "g"
);
export function unwrapLinkedImages(
  markdown: string,
  _placeholders: readonly string[] = []
): string {
  return markdown.replace(LINKED_IMAGE, "$1");
}

function descriptionFromTitle(title: string): string {
  const cleaned = compact(title).replace(/[。！？!?；;，,：:]$/, "");
  if (validSubstackDescription(cleaned)) return cleaned;
  const clause = cleaned
    .split(/[：:｜|！？!?—]/)
    .map(value => compact(value).replace(/[。！？!?；;，,：:]$/, ""))
    .find(value => validSubstackDescription(value));
  return clause || "海外长文精选";
}

function normalizeTranslatedBlocks(
  blocks: Array<{ kind: string; markdown: string; structure: string }>,
  translatedTitle: string
): string {
  const content = [...blocks];
  const firstContent = content.findIndex(block => block.kind !== "thematicBreak");
  if (
    firstContent >= 0 &&
    content[firstContent].kind === "heading" &&
    content[firstContent].structure === "h1"
  ) {
    const headingText = compact(
      toString(fromMarkdown(content[firstContent].markdown))
    );
    if (headingText === compact(translatedTitle)) content.splice(firstContent, 1);
  }
  const withoutRules = content.filter((block, index, values) => {
    if (block.kind !== "thematicBreak") return true;
    const before = values.slice(0, index).some(item => item.kind !== "thematicBreak");
    const after = values.slice(index + 1).some(item => item.kind !== "thematicBreak");
    return before && after && values[index - 1]?.kind !== "thematicBreak";
  });
  return withoutRules
    .map(block =>
      block.markdown.replace(/^(#{1,5})(?=\s)/gm, "#$1")
    )
    .join("\n\n")
    .trim();
}

export function validateAndRestoreTranslation(
  raw: unknown,
  sourceBlocks: readonly SourceBlock[],
  publication: NewsletterPublication
): TranslationResponse & {
  markdown: string;
  lengthRatio: number;
  warning?: string;
} {
  const response = translationResponseSchema.parse(raw);
  if (response.blocks.length !== sourceBlocks.length)
    throw new Error(
      `translated block count mismatch: ${response.blocks.length} != ${sourceBlocks.length}`
    );
  const restored: Array<{
    kind: string;
    markdown: string;
    structure: string;
  }> = [];
  for (let index = 0; index < sourceBlocks.length; index += 1) {
    const source = sourceBlocks[index];
    const translated = response.blocks[index];
    if (translated.id !== source.id)
      throw new Error(
        `translated block ID mismatch at ${source.id}: got ${translated.id}`
      );
    if (!translated.markdown.trim()) {
      if (!source.mayDropPromo)
        throw new Error(
          `translated block ${source.id} was dropped without a promotional marker`
        );
      continue;
    }
    if (/https?:\/\//i.test(translated.markdown))
      throw new Error(
        `translated block ${source.id} contains an unprotected raw URL`
      );
    const expected = placeholderNames(source.placeholders).sort();
    const actual = [...translated.markdown.matchAll(/URL_\d{4}_\d{3}/g)]
      .map(match => match[0])
      .sort();
    if (expected.join("\0") !== actual.join("\0"))
      throw new Error(`translated block ${source.id} changed URL placeholders`);
    if (structureSignature(translated.markdown) !== source.structure)
      throw new Error(
        `translated block ${source.id} changed Markdown structure`
      );
    let markdown = unwrapLinkedImages(
      translated.markdown,
      source.placeholders
    );
    for (const entry of source.placeholders) {
      const splitAt = entry.indexOf("=");
      markdown = markdown.replaceAll(
        entry.slice(0, splitAt),
        entry.slice(splitAt + 1)
      );
    }
    restored.push({
      kind: source.kind,
      markdown: markdown.trim(),
      structure: source.structure,
    });
  }
  const markdown = normalizeTranslatedBlocks(restored, response.title);
  const sourceChars = sourceBlocks.reduce(
    (total, block) =>
      total + compact(toString(fromMarkdown(block.markdown))).length,
    0
  );
  const translatedChars = compact(toString(fromMarkdown(markdown))).length;
  const lengthRatio = translatedChars / Math.max(sourceChars, 1);
  const limits = publication.translationLengthRatio;
  if (lengthRatio < limits.failMin || lengthRatio > limits.failMax) {
    throw new Error(
      `translation length ratio ${lengthRatio.toFixed(3)} outside ${limits.failMin}-${limits.failMax}`
    );
  }
  const description = validSubstackDescription(response.description)
    ? compact(response.description)
    : descriptionFromTitle(response.title);
  const replacedDescription = description !== compact(response.description);
  const warnings = [
    lengthRatio < limits.warnMin || lengthRatio > limits.warnMax
      ? `translation length ratio ${lengthRatio.toFixed(3)} outside warning range ${limits.warnMin}-${limits.warnMax}`
      : "",
    replacedDescription
      ? `description replaced because generated value violated the ${SUBSTACK_LIMITS.descriptionMaxChars}-character card contract`
      : "",
  ].filter(Boolean);
  return {
    ...response,
    description,
    markdown,
    lengthRatio,
    warning: warnings.length ? warnings.join("; ") : undefined,
  };
}

export function parseAiJson(text: string): unknown {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}
