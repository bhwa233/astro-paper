import { compact } from "./blog_common.ts";

export type SubstackQualityViolation = {
  code:
    | "body-h1"
    | "description"
    | "malformed-emphasis"
    | "missing-mention"
    | "orphan-markup"
    | "promo"
    | "title-suffix";
  file: string;
  message: string;
};

const PROMO_PATTERNS = [
  /^(?:#{1,6}\s*)?(?:请)?订阅(?:高级|付费)?(?:会员|通讯)?/im,
  /^(?:#{1,6}\s*)?(?:赞助|捐赠)\s*(?:=|即是|就是)?\s*(?:关爱|支持)?\s*$/im,
  /(?:欢迎|请|考虑)(?:点击)?.{0,12}(?:订阅|捐赠|赞助|成为付费会员)/i,
  /^(?:#{1,6}\s*)?(?:newsletter|donating\s*=\s*loving|subscribe|support (?:my|independent) work|become a paid subscriber)\b/im,
];

function splitPost(text: string): { frontmatter: string; body: string } {
  // Tolerate CRLF: a Windows checkout with core.autocrlf=true rewrites the line
  // endings, and an LF-only pattern silently yields an empty frontmatter, which
  // then reports every field as missing rather than as unparsed.
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) return { frontmatter: "", body: text };
  return { frontmatter: match[1], body: match[2] };
}

function frontmatterString(frontmatter: string, field: string): string {
  const raw = frontmatter.match(new RegExp(`^${field}:\\s*(.+)$`, "m"))?.[1];
  if (!raw) return "";
  try {
    return JSON.parse(raw);
  } catch {
    return raw.replace(/^['"]|['"]$/g, "");
  }
}

export function validSubstackDescription(value: string): boolean {
  const description = compact(value);
  return (
    [...description].length >= 4 &&
    [...description].length <= 20 &&
    !/^本文/.test(description) &&
    !/[。！？!?；;，,：:]$/.test(description)
  );
}

export function substackPostQualityViolations(
  text: string,
  file: string
): SubstackQualityViolation[] {
  const { frontmatter, body } = splitPost(text);
  const violations: SubstackQualityViolation[] = [];
  const description = frontmatterString(frontmatter, "description");
  const title = frontmatterString(frontmatter, "title");
  if (!validSubstackDescription(description)) {
    violations.push({
      code: "description",
      file,
      message:
        "description 必须为 4-20 个码点的完整短语，不以「本文」开头或标点结尾",
    });
  }
  if (/^#\s+/m.test(body)) {
    violations.push({
      code: "body-h1",
      file,
      message: "正文不能包含 H1；页面标题已经占用唯一 H1",
    });
  }
  if (/^(?:>\s*)?(?:\*{1,3}|(?:\\\*){1,3})\s*$/m.test(body)) {
    violations.push({
      code: "orphan-markup",
      file,
      message: "正文包含孤立的 Markdown 强调标记",
    });
  }
  if (/\\\*[^\n]*\*{2,}|\*{2,}[^\n]*\\\*/.test(body)) {
    violations.push({
      code: "malformed-emphasis",
      file,
      message: "正文包含混合转义的 Markdown 强调标记",
    });
  }
  if (/(?:从|参见|见|由)\s+的(?:《|\[)/.test(body)) {
    violations.push({
      code: "missing-mention",
      file,
      message: "正文包含缺失姓名的提及",
    });
  }
  if (PROMO_PATTERNS.some(pattern => pattern.test(body))) {
    violations.push({
      code: "promo",
      file,
      message: "正文包含订阅、捐赠或付费推广 CTA",
    });
  }
  if (/｜[^｜]{2,40}$/.test(title)) {
    violations.push({
      code: "title-suffix",
      file,
      message: "标题末尾不再重复栏目名；栏目由标签和来源区展示",
    });
  }
  return violations;
}

export function assertSubstackPostQuality(text: string, file: string): void {
  const violations = substackPostQualityViolations(text, file);
  if (!violations.length) return;
  throw new Error(
    `${file} failed newsletter content quality: ${violations.map(item => `${item.code}: ${item.message}`).join("; ")}`
  );
}
