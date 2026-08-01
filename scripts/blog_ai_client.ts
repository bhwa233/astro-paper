import { clipText, writeStderr } from "./blog_common.ts";

export const DEFAULT_AI_BASE_URL = "https://www.right.codes/codex/v1";
export const DEFAULT_AI_MODEL = "gpt-5.6-terra";
export const DEFAULT_FALLBACK_AI_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_FALLBACK_AI_MODEL = "deepseek-v4-flash";
export const DEFAULT_MAX_TOKENS = 8192;

export type AiApiStyle = "responses" | "chat";

export type AiConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  apiStyle?: AiApiStyle;
};

const SYSTEM_PROMPT_JSON = "你是严格的中文技术编辑。只输出一个合法 JSON 对象，不要输出解释、Markdown、前后缀或代码围栏。";
const SYSTEM_PROMPT_MARKDOWN = "你是严格的中文博客编辑。只输出可归档的 Markdown 正文，不输出解释、前后缀或代码围栏。";

function systemPrompt(jsonMode: boolean): string {
  return jsonMode ? SYSTEM_PROMPT_JSON : SYSTEM_PROMPT_MARKDOWN;
}

function responsesInputPrompt(prompt: string, jsonMode: boolean): string {
  if (!jsonMode) return prompt;
  // Some Responses-compatible providers validate JSON-mode instructions in input,
  // not only in the top-level instructions field.
  return `Return a valid json object only.\n\n${prompt}`;
}

export type AiCallResult = {
  content: string;
  config: AiConfig;
  usedFallback: boolean;
  // Populated when the primary target failed (whether or not a fallback then succeeded).
  primaryError?: string;
};

function envDurationMs(name: string, fallback: number): number {
  const value = Number(process.env[name] || "");
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envPositiveInt(name: string, fallback: number): number {
  const value = Number(process.env[name] || "");
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function envBool(name: string, fallback: boolean): boolean {
  const value = (process.env[name] || "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;
  return fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Transient = worth retrying the same target: dropped connections, resets, timeouts, 5xx, 429.
// Permanent (4xx other than 429, empty/invalid content) is not retried.
export function isTransientAiError(message: string): boolean {
  if (/^AI request timed out/.test(message)) return true;
  if (/^AI provider HTTP (?:5\d\d|429)\b/.test(message)) return true;
  if (/^AI request failed:/.test(message)) return true; // network/TLS/connection layer
  return false;
}

// Cooldown = the provider parked the model/credentials for minutes ("All credentials for model X
// are cooling down"). Seconds-scale retries never outlive it, so these get their own minute-scale
// backoff. Some providers surface it as HTTP 429, others as an SSE error event with HTTP 200.
export function isCooldownAiError(message: string): boolean {
  if (/^AI provider HTTP 429\b/.test(message)) return true;
  return /model_cooldown|cooling down|rate.?limit/i.test(message);
}

// Retry-After is either delta-seconds or an HTTP date.
export function parseRetryAfterMs(value: string | null | undefined, nowMs = Date.now()): number {
  const raw = (value || "").trim();
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return seconds > 0 ? Math.round(seconds * 1000) : 0;
  const at = Date.parse(raw);
  return Number.isFinite(at) ? Math.max(0, at - nowMs) : 0;
}

type AiRetryableError = Error & { retryAfterMs?: number };

function errorRetryAfterMs(error: unknown): number {
  const value = (error as AiRetryableError | undefined)?.retryAfterMs;
  return typeof value === "number" && value > 0 ? value : 0;
}

// Wait the provider's Retry-After when it sends one, else exponential from the base delay.
// ±20% jitter keeps concurrent workflows from waking up together and re-triggering the cooldown.
function cooldownDelayMs(retryIndex: number, retryAfterMs: number): number {
  const baseDelayMs = envPositiveInt("AI_COOLDOWN_RETRY_DELAY_MS", 60_000);
  const maxDelayMs = envPositiveInt("AI_COOLDOWN_RETRY_MAX_DELAY_MS", 300_000);
  const planned = retryAfterMs > 0 ? Math.max(retryAfterMs, 1_000) : baseDelayMs * 2 ** retryIndex;
  const jittered = Math.round(planned * (1 + (Math.random() * 0.4 - 0.2)));
  return Math.min(Math.max(jittered, 1_000), maxDelayMs);
}

// Cooldown waiting is budgeted per process, not per call: `--task all` runs tasks sequentially, so
// an unbudgeted per-task wait would multiply across the run.
let cooldownWaitedMs = 0;

export function resetCooldownWaitBudget(): void {
  cooldownWaitedMs = 0;
}

function envApiStyle(name: string, fallback: AiApiStyle): AiApiStyle {
  const value = (process.env[name] || "").trim().toLowerCase();
  return value === "responses" || value === "chat" ? value : fallback;
}

export function chatCompletionsUrl(baseUrl: string): string {
  const cleaned = baseUrl.replace(/\/+$/, "");
  return cleaned.endsWith("/chat/completions") ? cleaned : `${cleaned}/chat/completions`;
}

export function responsesUrl(baseUrl: string): string {
  const cleaned = baseUrl.replace(/\/+$/, "");
  return cleaned.endsWith("/responses") ? cleaned : `${cleaned}/responses`;
}

// Parse an OpenAI Responses API SSE stream (buffered) into final text.
// Prefers the authoritative text on response.completed; falls back to accumulated deltas.
export function parseResponsesSse(sse: string): string {
  const deltas: string[] = [];
  let finalText = "";
  let failure = "";
  for (const block of sse.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trim())
      .join("\n");
    if (!data || data === "[DONE]") continue;
    let event: {
      type?: string;
      delta?: string;
      message?: string;
      error?: { message?: string };
      response?: { error?: { message?: string }; output?: { content?: { type?: string; text?: string }[] }[] };
    };
    try {
      event = JSON.parse(data);
    } catch {
      continue;
    }
    switch (event.type) {
      case "response.output_text.delta":
        if (typeof event.delta === "string") deltas.push(event.delta);
        break;
      case "response.completed": {
        const output = event.response?.output;
        if (Array.isArray(output)) {
          finalText = output
            .flatMap(item => (Array.isArray(item?.content) ? item.content : []))
            .filter(part => part?.type === "output_text" && typeof part.text === "string")
            .map(part => part.text as string)
            .join("");
        }
        break;
      }
      case "response.failed":
      case "response.error":
      case "error":
        failure = event.response?.error?.message || event.error?.message || event.message || "unknown responses API error";
        break;
    }
  }
  if (failure) throw new Error(`AI responses API error: ${failure}`);
  return finalText.trim() ? finalText : deltas.join("");
}

export async function callBlogAi({
  prompt,
  apiKey,
  baseUrl,
  model,
  apiStyle = "chat",
  timeoutMs = envDurationMs("AI_TIMEOUT_MS", 120_000),
  maxTokens = DEFAULT_MAX_TOKENS,
  jsonMode = false,
}: {
  prompt: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  apiStyle?: AiApiStyle;
  timeoutMs?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<string> {
  if (!apiKey) throw new Error("AI_API_KEY is required for live AI blog generation");
  if (!baseUrl) throw new Error("AI_BASE_URL is required for live AI blog generation");
  if (!model) throw new Error("AI_MODEL is required for live AI blog generation");
  const useResponses = apiStyle === "responses";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body = useResponses
      ? {
          model,
          instructions: systemPrompt(jsonMode),
          // Some provider backends strictly require the list form and reject a bare string
          // with HTTP 400 "Input must be a list".
          input: [{ role: "user", content: responsesInputPrompt(prompt, jsonMode) }],
          reasoning: { effort: "high" },
          max_output_tokens: maxTokens,
        }
      : {
          model,
          messages: [
            { role: "system", content: systemPrompt(jsonMode) },
            { role: "user", content: prompt },
          ],
          temperature: 0.4,
          max_tokens: maxTokens,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        };
    const response = await fetch(useResponses ? responsesUrl(baseUrl) : chatCompletionsUrl(baseUrl), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const raw = await response.text();
    if (!response.ok) {
      const failure: AiRetryableError = new Error(`AI provider HTTP ${response.status}: ${clipText(raw, 1200)}`);
      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      if (retryAfterMs > 0) failure.retryAfterMs = retryAfterMs;
      throw failure;
    }
    let content: string | undefined;
    if (useResponses) {
      content = parseResponsesSse(raw);
    } else {
      const data = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] };
      content = data.choices?.[0]?.message?.content;
    }
    if (!content?.trim()) throw new Error(`AI response missing message content: ${raw}`);
    return content;
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.message === "This operation was aborted")) throw new Error(`AI request timed out after ${timeoutMs}ms`);
    if (error instanceof Error && /^(AI provider HTTP|AI response missing message content:)/.test(error.message)) throw error;
    if (error instanceof Error) throw new Error(`AI request failed: ${error.message}`);
    throw new Error(`AI request failed: ${String(error)}`);
  } finally {
    clearTimeout(timer);
  }
}

export function envAiConfig({
  model = "",
  baseUrl = "",
  apiKey = "",
}: {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
} = {}): AiConfig {
  return {
    apiKey: apiKey || process.env.AI_API_KEY || "",
    baseUrl: baseUrl || process.env.AI_BASE_URL || DEFAULT_AI_BASE_URL,
    model: model || process.env.AI_MODEL || DEFAULT_AI_MODEL,
    apiStyle: envApiStyle("AI_API_STYLE", "responses"),
  };
}

export function envFallbackAiConfig({
  model = "",
  baseUrl = "",
  apiKey = "",
}: {
  model?: string;
  baseUrl?: string;
  apiKey?: string;
} = {}): AiConfig {
  return {
    apiKey: apiKey || process.env.AI_FALLBACK_API_KEY || "",
    baseUrl: baseUrl || process.env.AI_FALLBACK_BASE_URL || DEFAULT_FALLBACK_AI_BASE_URL,
    model: model || process.env.AI_FALLBACK_MODEL || DEFAULT_FALLBACK_AI_MODEL,
    apiStyle: envApiStyle("AI_FALLBACK_API_STYLE", "chat"),
  };
}

function sameAiTarget(left: AiConfig, right: AiConfig): boolean {
  return left.apiKey === right.apiKey && left.baseUrl === right.baseUrl && left.model === right.model;
}

function missingConfigField(config: AiConfig): keyof AiConfig | "" {
  if (!config.apiKey) return "apiKey";
  if (!config.baseUrl) return "baseUrl";
  if (!config.model) return "model";
  return "";
}

function configErrorMessage(config: AiConfig, label: "primary" | "fallback"): string {
  const field = missingConfigField(config);
  if (!field) return "";
  const name = label === "fallback"
    ? field === "apiKey"
      ? "AI_FALLBACK_API_KEY"
      : field === "baseUrl"
        ? "AI_FALLBACK_BASE_URL"
        : "AI_FALLBACK_MODEL"
    : field === "apiKey"
      ? "AI_API_KEY"
      : field === "baseUrl"
        ? "AI_BASE_URL"
        : "AI_MODEL";
  return `${label} AI config missing ${name}`;
}

function withPriorFailureContext(error: Error, previousError: string): Error {
  error.message = `${error.message} | primary failure: ${clipText(previousError, 400)}`;
  return error;
}

export async function callBlogAiWithFailover({
  prompt,
  primaryConfig = envAiConfig(),
  fallbackConfig = envFallbackAiConfig(),
  timeoutMs = envDurationMs("AI_TIMEOUT_MS", 120_000),
  maxTokens = DEFAULT_MAX_TOKENS,
  jsonMode = false,
}: {
  prompt: string;
  primaryConfig?: AiConfig;
  fallbackConfig?: AiConfig;
  timeoutMs?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<AiCallResult> {
  const primaryConfigError = configErrorMessage(primaryConfig, "primary");
  const fallbackConfigError = configErrorMessage(fallbackConfig, "fallback");
  let primaryError = primaryConfigError;

  if (!primaryConfigError) {
    // Retry the primary target on transient failures (dropped connections under load, 5xx, 429)
    // before falling back — the provider drops a fraction of concurrent connections.
    // Two retry budgets: seconds-scale for connection-level blips, minutes-scale for model cooldown.
    const attempts = envPositiveInt("AI_PRIMARY_RETRY_ATTEMPTS", 3);
    const baseDelayMs = envPositiveInt("AI_PRIMARY_RETRY_DELAY_MS", 800);
    const cooldownAttempts = envPositiveInt("AI_COOLDOWN_RETRY_ATTEMPTS", 4);
    const cooldownBudgetMs = envPositiveInt("AI_COOLDOWN_TOTAL_BUDGET_MS", 900_000);
    let transientRetries = 0;
    let cooldownRetries = 0;
    for (;;) {
      try {
        const content = await callBlogAi({ prompt, ...primaryConfig, timeoutMs, maxTokens, jsonMode });
        const retried = transientRetries > 0 || cooldownRetries > 0;
        return { content, config: primaryConfig, usedFallback: false, primaryError: retried ? primaryError : undefined };
      } catch (error) {
        primaryError = error instanceof Error ? error.message : String(error);
        if (isCooldownAiError(primaryError) && cooldownRetries < cooldownAttempts - 1) {
          const delayMs = cooldownDelayMs(cooldownRetries, errorRetryAfterMs(error));
          if (cooldownWaitedMs + delayMs > cooldownBudgetMs) {
            writeStderr(`[ai] ${primaryConfig.model} cooldown wait budget exhausted (${Math.round(cooldownWaitedMs / 1000)}s used); giving up`);
            break;
          }
          cooldownRetries += 1;
          cooldownWaitedMs += delayMs;
          writeStderr(`[ai] ${primaryConfig.model} cooling down; retry ${cooldownRetries}/${cooldownAttempts - 1} in ${Math.round(delayMs / 1000)}s`);
          await sleep(delayMs);
          continue;
        }
        if (isTransientAiError(primaryError) && transientRetries < attempts - 1) {
          transientRetries += 1;
          await sleep(baseDelayMs * transientRetries);
          continue;
        }
        break;
      }
    }
  }

  // Fallback is opt-in and off by default, so local runs fail loudly instead of silently switching
  // models. Publish workflows set AI_FALLBACK_ENABLED=true: a cooldown longer than the retry budget
  // should still produce a post, and the switch is reported (WARN log + ai_fallback_used).
  if (!envBool("AI_FALLBACK_ENABLED", false)) {
    throw new Error(primaryError || primaryConfigError || "primary AI request failed");
  }
  if (fallbackConfigError) {
    throw new Error(primaryError || fallbackConfigError);
  }
  if (sameAiTarget(primaryConfig, fallbackConfig)) {
    throw new Error(primaryError || "primary and fallback AI targets are identical");
  }

  try {
    const content = await callBlogAi({ prompt, ...fallbackConfig, timeoutMs, maxTokens, jsonMode });
    return { content, config: fallbackConfig, usedFallback: true, primaryError: primaryError || primaryConfigError };
  } catch (error) {
    if (error instanceof Error) throw withPriorFailureContext(error, primaryError || primaryConfigError);
    throw new Error(`${String(error)} | primary failure: ${clipText(primaryError || primaryConfigError, 400)}`);
  }
}
