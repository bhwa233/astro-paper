// Reuse the existing HTTP retry helper and Zod. This module only resolves SparkHub's
// versioned runtime contract; credentials stay in this process and never in snapshots.
import { z } from "zod";
import { fetchJson, writeStderr } from "./blog_common.ts";

const target = z.object({ provider: z.string().min(1), model: z.string().min(1) });
const credentials = z.enum([
  "OPENAI_API_KEY",
  "COMMAND_AI_API_KEY",
  "PODCAST_GEMINI_API_KEY",
  "PODCAST_GOOGLE_GEMINI_API_KEY",
  "AI_API_KEY",
  "PODCAST_GEMINI_ARTICLE_API_KEY",
  "AI_FALLBACK_API_KEY",
]);
const snapshotSchema = z.object({
  revision: z.number().int().positive(),
  config: z.object({
    providers: z.record(z.string(), z.object({ baseUrl: z.url(), protocol: z.enum(["chat", "gemini"]), credential: credentials })),
    bindings: z.record(z.string(), z.object({ primary: target, fallback: target.nullable() })),
  }),
});
export type AiSnapshot = z.infer<typeof snapshotSchema>;
export type BlogAiScope = "blog" | "reddit" | "blog-transcription" | "blog-article";

export async function fetchAiSnapshot(): Promise<AiSnapshot> {
  const token = process.env.SPARKHUB_DASHBOARD_TOKEN;
  if (!token) throw new Error("SPARKHUB_DASHBOARD_TOKEN is required for central AI configuration");
  const url = new URL("/api/linkdisk/dashboard/ai/runtime", process.env.SPARKHUB_API_URL || "https://api.bhwa233.com");
  if (url.protocol !== "https:") throw new Error("AI configuration requires HTTPS");
  const revision = process.env.AI_CONFIG_REVISION;
  if (revision) {
    if (!/^[1-9]\d*$/.test(revision)) throw new Error("Invalid AI_CONFIG_REVISION");
    url.searchParams.set("revision", revision);
  }
  const response = await fetchJson<{ success: boolean; data: unknown }>(url.href, {
    headers: { Authorization: `Bearer ${token}` },
    timeoutMs: 30_000,
    retries: 2,
  });
  if (!response.success) throw new Error("AI configuration could not be loaded");
  const snapshot = snapshotSchema.parse(response.data);
  if (revision && snapshot.revision !== Number(revision)) throw new Error("AI configuration revision mismatch");
  return snapshot;
}

let cached: { json: string; snapshot: AiSnapshot } | undefined;
export function runtimeSnapshot(): AiSnapshot {
  const json = process.env.AI_CONFIG_JSON;
  if (!json) throw new Error("Central AI configuration is required. Start with node --import tsx --import ./scripts/load_ai_config.ts <script>.");
  if (cached?.json !== json) cached = { json, snapshot: snapshotSchema.parse(JSON.parse(json)) };
  const revision = process.env.AI_CONFIG_REVISION;
  if (revision && cached.snapshot.revision !== Number(revision)) throw new Error("AI configuration revision mismatch");
  return cached.snapshot;
}
export function textAiScope(): BlogAiScope {
  return process.env.AI_CONFIG_SCOPE === "reddit" || /reddit/.test(process.argv[1] || "") || process.argv.includes("reddit-top20") ? "reddit" : "blog";
}
export function configuredTarget(scope: BlogAiScope = textAiScope(), fallback = false) {
  const snapshot = runtimeSnapshot();
  const binding = snapshot.config.bindings[scope];
  if (!binding) throw new Error(`Missing AI binding: ${scope}`);
  const selected = fallback ? binding.fallback : binding.primary;
  if (!selected) return null;
  const provider = snapshot.config.providers[selected.provider];
  if (!provider) throw new Error(`Missing AI provider: ${selected.provider}`);
  const apiKey = process.env[provider.credential] || "";
  if (!apiKey) throw new Error(`Credential ${provider.credential} is missing in this runtime`);
  const url = new URL(provider.baseUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Invalid AI provider URL");
  if (scope.startsWith("blog-") && provider.protocol !== "gemini") throw new Error(`${scope} requires Gemini`);
  return {
    apiKey,
    baseUrl: provider.baseUrl,
    apiStyle: provider.protocol,
    model: selected.model,
    revision: snapshot.revision,
    scope,
    provider: selected.provider,
  };
}
export function primaryTarget(scope?: BlogAiScope) {
  const target = configuredTarget(scope);
  if (!target) throw new Error("Primary AI target is missing");
  return target;
}
export function logAiResult(config: { model: string; revision?: number; scope?: string; provider?: string }, returnedModel?: string) {
  writeStderr(
    JSON.stringify({
      event: "ai.completed",
      revision: config.revision,
      scope: config.scope,
      provider: config.provider,
      requestedModel: config.model,
      returnedModel,
    })
  );
}
