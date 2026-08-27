import { z } from "zod";

// 抓取与翻译的全局限制，全部栏目共用一套。之前每个栏目各带一份，14 条配置里 84 行只有三种取值，
// 差异纯粹是按各自实测微调出来的，没有语义分歧，所以收敛成常量。
export const SUBSTACK_LIMITS = {
  /** frontmatter description 是文章卡片上的完整主题短语。 */
  descriptionMaxChars: 20,
  /** 清洗后的原文可见字符下限；不含 Markdown 标记、URL、空白。 */
  minSourceTextChars: 4_000,
  /** RSS 响应体上限。SatPost 实测 3.4 MB，这里留足余量，只作内存边界。 */
  maxFeedBytes: 16_000_000,
  /** 单张图片的响应体上限。 */
  maxImageBytes: 12_000_000,
  /** 解码后像素上限，防解压炸弹：字节小不代表像素少。 */
  maxImagePixels: 40_000_000,
  /** 一次运行每个栏目最多处理几篇。定时任务按它跑，手动运行可用 --max-posts 放大。 */
  maxPostsPerRun: 1,
  /** 手动运行时 --max-posts 的硬顶。 */
  maxPostsPerRunCeiling: 5,
  /** 单篇预估 token 上限，只作跑飞护栏；模型上下文远大于它。 */
  maxEstimatedTokensPerArticle: 200_000,
  /**
   * 每个栏目每次运行的 token 预算，各栏目独立计。
   * 必须 >= 2 倍单篇上限：开 fallback 时按估算量的两倍预留。
   */
  publicationTokenBudget: 400_000,
} as const;

export const patternConfigSchema = z.object({
  source: z.string().min(1),
  flags: z
    .string()
    .regex(/^[dgimsuvy]*$/)
    .optional(),
});

export const extractionAuditConfigSchema = z.object({
  minTextRatio: z.number().min(0).max(1).default(0.95),
});

export const translationLengthRatioSchema = z
  .object({
    warnMin: z.number().positive(),
    warnMax: z.number().positive(),
    failMin: z.number().positive(),
    failMax: z.number().positive(),
  })
  .refine(
    value =>
      value.failMin <= value.warnMin &&
      value.warnMin < value.warnMax &&
      value.warnMax <= value.failMax,
    {
      message:
        "translation ratio limits must satisfy failMin <= warnMin < warnMax <= failMax",
    }
  );

export const newsletterWechatSchema = z.object({
  enabled: z.boolean().default(false),
  cover: z.enum(["default", "first-image"]).default("default"),
});

export const newsletterPublicationSchema = z.object({
  key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  kind: z.enum(["substack", "rss"]),
  displayName: z.string().min(1),
  author: z.string().min(1),
  feedUrl: z.string().url().startsWith("https://"),
  siteUrl: z.string().url().startsWith("https://"),
  feedHosts: z.array(z.string().min(1)).min(1),
  articleHosts: z.array(z.string().min(1)).min(1),
  imageHosts: z.array(z.string().min(1)),
  tag: z.string().min(1),
  focus: z.array(z.string().min(1)).default([]),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  topics: z.array(z.string().min(1)).default([]),
  selectionMode: z.enum(["automatic", "manual"]).default("automatic"),
  selectionRule: z.string().min(1).optional(),
  enabled: z.boolean(),
  startAt: z.string().date(),
  imagePolicy: z.enum(["none", "remote", "mirror"]),
  removeSelectors: z.array(z.string().min(1)).default([]),
  cutBeforePatterns: z.array(patternConfigSchema).default([]),
  cutAfterPatterns: z.array(patternConfigSchema).default([]),
  /** 删掉正文中间匹配到的顶层块本身，不截断前后。给中插的订阅 CTA 用。 */
  dropPatterns: z.array(patternConfigSchema).default([]),
  excludeTitlePatterns: z.array(patternConfigSchema).default([]),
  extractionAudit: extractionAuditConfigSchema.default({ minTextRatio: 0.95 }),
  translationLengthRatio: translationLengthRatioSchema.default({
    warnMin: 0.4,
    warnMax: 0.6,
    failMin: 0.3,
    failMax: 0.75,
  }),
  authorizedTranslation: z.boolean().default(false),
  wechat: newsletterWechatSchema.default({
    enabled: false,
    cover: "default",
  }),
});

export type PatternConfig = z.infer<typeof patternConfigSchema>;
export type NewsletterPublication = z.infer<typeof newsletterPublicationSchema>;

// 整篇进、整篇出：模型收到完整原文，回一篇完整译文。删不删与文章无关的段落由模型自己判断，
// 程序不再逐块核对，因此这里只剩下装载三个字段的信封。
export const translationResponseSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  markdown: z.string().min(1),
});

export type TranslationResponse = z.infer<typeof translationResponseSchema>;

export const tokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});

export type TokenUsage = z.infer<typeof tokenUsageSchema>;

const substackLedgerIssueBaseSchema = z.object({
  guid: z.string(),
  canonicalUrl: z.string().url(),
  sourcePublishedAt: z.string().datetime(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
});

export const substackLedgerIssueSchema = z.discriminatedUnion("status", [
  substackLedgerIssueBaseSchema.extend({
    status: z.literal("published"),
    postPath: z.string().min(1),
    translatedAt: z.string().datetime(),
    model: z.string().min(1),
    usage: tokenUsageSchema.optional(),
  }),
  substackLedgerIssueBaseSchema.extend({
    status: z.literal("skipped"),
    reason: z.literal("below-min-source-length"),
    sourceTextChars: z.number().int().nonnegative(),
    minimumSourceTextChars: z.number().int().positive(),
    evaluatedAt: z.string().datetime(),
  }),
]);

export const substackLedgerSchema = z.object({
  version: z.literal(1),
  issues: z.array(substackLedgerIssueSchema),
});

export type SubstackLedgerIssue = z.infer<typeof substackLedgerIssueSchema>;
export type SubstackLedger = z.infer<typeof substackLedgerSchema>;
