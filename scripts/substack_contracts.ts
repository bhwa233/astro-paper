import { z } from "zod";

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
  enabled: z.boolean(),
  startAt: z.string().date(),
  minTextChars: z.number().int().positive(),
  maxFeedBytes: z.number().int().positive(),
  maxImageBytes: z.number().int().positive(),
  maxImagePixels: z.number().int().positive(),
  maxPostsPerRun: z.number().int().positive(),
  maxEstimatedTokensPerArticle: z.number().int().positive(),
  imagePolicy: z.enum(["none", "remote", "mirror"]),
  removeSelectors: z.array(z.string().min(1)).default([]),
  cutBeforePatterns: z.array(patternConfigSchema).default([]),
  cutAfterPatterns: z.array(patternConfigSchema).default([]),
  excludeTitlePatterns: z.array(patternConfigSchema).default([]),
  extractionAudit: extractionAuditConfigSchema.default({ minTextRatio: 0.95 }),
  translationLengthRatio: translationLengthRatioSchema.default({
    warnMin: 0.4,
    warnMax: 0.6,
    failMin: 0.3,
    failMax: 0.75,
  }),
  authorizedTranslation: z.boolean().default(false),
});

export type PatternConfig = z.infer<typeof patternConfigSchema>;
export type NewsletterPublication = z.infer<typeof newsletterPublicationSchema>;

export const translationBlockSchema = z.object({
  id: z.string().regex(/^b-\d{4}$/),
  markdown: z.string(),
});

export const translationResponseSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  blocks: z.array(translationBlockSchema).min(1),
});

export type TranslationResponse = z.infer<typeof translationResponseSchema>;

export const tokenUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
  totalTokens: z.number().int().nonnegative().optional(),
});

export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export const substackLedgerIssueSchema = z.object({
  guid: z.string(),
  canonicalUrl: z.string().url(),
  sourcePublishedAt: z.string().datetime(),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  status: z.literal("published"),
  postPath: z.string().min(1),
  translatedAt: z.string().datetime(),
  model: z.string().min(1),
  usage: tokenUsageSchema.optional(),
});

export const substackLedgerSchema = z.object({
  version: z.literal(1),
  issues: z.array(substackLedgerIssueSchema),
});

export type SubstackLedgerIssue = z.infer<typeof substackLedgerIssueSchema>;
export type SubstackLedger = z.infer<typeof substackLedgerSchema>;
