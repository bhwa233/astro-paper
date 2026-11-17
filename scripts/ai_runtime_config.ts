// Reuse the existing HTTP retry helper and Zod. This module only resolves SparkHub's
// versioned runtime contract; credentials stay in this process and never in snapshots.
import { z } from "zod";
import { fetchJson, writeStderr } from "./blog_common.ts";

const target = z.object({ provider: z.string().min(1), model: z.string().min(1) });
const legacyCredentials = z.enum([
  "OPENAI_API_KEY",
  "COMMAND_AI_API_KEY",
  "PODCAST_GEMINI_API_KEY",
  "PODCAST_GOOGLE_GEMINI_API_KEY",
  "AI_API_KEY",
  "PODCAST_GEMINI_ARTICLE_API_KEY",
  "AI_FALLBACK_API_KEY",
]);
const managedCredential = z.string().regex(/^managed:[a-f0-9-]{36}$/);
const credentials = z.union([legacyCredentials, managedCredential]);
const runtimeCredentialsSchema = z.preprocess(
  value => {
    if (typeof value !== "string") return value;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      // Native JSON errors can include snippets of the private payload.
      return null;
    }
  },
  z.object({ revision: z.number().int().positive(), credentials: z.record(managedCredential, z.string().min(1).max(8192)) }).strict()
);
const JOB_SCOPES = ["blog", "reddit", "blog-transcription", "blog-article"] as const;
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

// Deliver only keys referenced by this pinned job. The response is private runtime
// state, never part of the public snapshot, stdout or generation artifacts.
export async function loadRuntimeCredentials(snapshot: AiSnapshot): Promise<void> {
  const scopes = JOB_SCOPES.filter(scope => snapshot.config.bindings[scope]);
  const needed = new Set(
    scopes.flatMap(scope => {
      const binding = snapshot.config.bindings[scope];
      return [binding.primary, binding.fallback].flatMap(target => {
        const name = target && snapshot.config.providers[target.provider]?.credential;
        return name?.startsWith("managed:") ? [name] : [];
      });
    })
  );
  if (!needed.size) return;
  const existing = process.env.AI_RUNTIME_CREDENTIALS_JSON;
  if (existing) {
    const parsed = runtimeCredentialsSchema.safeParse(existing);
    if (parsed.success && parsed.data.revision === snapshot.revision && [...needed].every(name => parsed.data.credentials[name])) return;
  }
  const token = process.env.SPARKHUB_DASHBOARD_TOKEN;
  if (!token) throw new Error("SPARKHUB_DASHBOARD_TOKEN is required to load saved model keys");
  const url = new URL("/api/linkdisk/dashboard/ai/runtime/credentials", process.env.SPARKHUB_API_URL || "https://api.bhwa233.com");
  if (url.protocol !== "https:") throw new Error("AI credentials require HTTPS");
  let response: { success: boolean; data: unknown };
  try {
    response = await fetchJson(url.href, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ revision: snapshot.revision, scopes }),
      timeoutMs: 30_000,
      retries: 2,
    });
  } catch {
    throw new Error("Saved model keys could not be loaded from Admin");
  }
  const parsed = runtimeCredentialsSchema.safeParse(response.data);
  if (
    !response.success ||
    !parsed.success ||
    parsed.data.revision !== snapshot.revision ||
    [...needed].some(name => !parsed.data.credentials[name]) ||
    Object.keys(parsed.data.credentials).some(name => !needed.has(name))
  ) {
    throw new Error("Invalid or incomplete saved model credentials for the pinned revision");
  }
  if (process.env.GITHUB_ACTIONS === "true") {
    for (const value of Object.values(parsed.data.credentials)) {
      // CI redirects public snapshot stdout to /dev/null. Keep masking on stderr.
      // Escape workflow-command data before masking, including multiline upstream values.
      writeStderr(`::add-mask::${value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A")}\n`);
    }
  }
  process.env.AI_RUNTIME_CREDENTIALS_JSON = JSON.stringify(parsed.data);
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
  let apiKey: string;
  if (provider.credential.startsWith("managed:")) {
    // Managed references never silently fall back to a legacy environment key.
    const parsed = runtimeCredentialsSchema.safeParse(process.env.AI_RUNTIME_CREDENTIALS_JSON || "null");
    if (!parsed.success || parsed.data.revision !== snapshot.revision)
      throw new Error("Saved model keys are missing for this revision. Run load_ai_config.ts first.");
    apiKey = parsed.data.credentials[provider.credential] || "";
  } else {
    apiKey = process.env[legacyCredentials.parse(provider.credential)] || "";
  }
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
