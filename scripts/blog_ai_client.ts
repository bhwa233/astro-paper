import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateText, NoObjectGeneratedError, Output } from "ai";
import { clipText, envBool, envPositiveInt, envPositiveNumber, sleep, writeStderr } from "./blog_common.ts";

export const DEFAULT_AI_BASE_URL = "https://rightapi.ai/codex/v1";
export const DEFAULT_AI_MODEL = "gpt-5.6-luna";
export const DEFAULT_FALLBACK_AI_BASE_URL = "https://api.deepseek.com";
export const DEFAULT_FALLBACK_AI_MODEL = "deepseek-v4-flash";
// 推理 token 也算在输出上限里，推理型模型很容易在几千 token 处被截断成半截 JSON。
// 这个默认值只是防跑飞的护栏，不是配额。
export const DEFAULT_MAX_TOKENS = 64_000;

// AI_MAX_TOKENS=0 表示连上限字段都不发送，交给服务端自己决定。
export function envMaxTokens(): number | null {
  return (process.env.AI_MAX_TOKENS || "").trim() === "0" ? null : envPositiveInt("AI_MAX_TOKENS", DEFAULT_MAX_TOKENS);
}

export type AiApiStyle = "responses" | "chat" | "gemini";

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

export type AiCallResult = {
  content: string;
  config: AiConfig;
  usedFallback: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  finishReason?: string;
  // Populated when the primary target failed (whether or not a fallback then succeeded).
  primaryError?: string;
};

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

function envApiStyle(name: string, fallback: AiApiStyle): AiApiStyle {
  const value = (process.env[name] || "").trim().toLowerCase();
  return value === "responses" || value === "chat" || value === "gemini" ? value : fallback;
}

export function chatCompletionsUrl(baseUrl: string): string {
  const cleaned = baseUrl.replace(/\/+$/, "");
  return cleaned.endsWith("/chat/completions") ? cleaned : `${cleaned}/chat/completions`;
}

export async function callBlogAi({
  prompt,
  apiKey,
  baseUrl,
  model,
  apiStyle = "chat",
  timeoutMs = envPositiveNumber("AI_TIMEOUT_MS", 120_000),
  maxTokens = envMaxTokens(),
  jsonMode = false,
}: {
  prompt: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  apiStyle?: AiApiStyle;
  timeoutMs?: number;
  maxTokens?: number | null;
  jsonMode?: boolean;
}): Promise<string> {
  return (await callBlogAiOnce({ prompt, apiKey, baseUrl, model, apiStyle, timeoutMs, maxTokens, jsonMode })).content;
}

async function callBlogAiOnce({
  prompt,
  apiKey,
  baseUrl,
  model,
  apiStyle = "chat",
  timeoutMs = envPositiveNumber("AI_TIMEOUT_MS", 120_000),
  maxTokens = envMaxTokens(),
  jsonMode = false,
}: {
  prompt: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  apiStyle?: AiApiStyle;
  timeoutMs?: number;
  maxTokens?: number | null;
  jsonMode?: boolean;
}): Promise<{ content: string; usage?: AiCallResult["usage"]; finishReason?: string }> {
  if (!apiKey) throw new Error("AI_API_KEY is required for live AI blog generation");
  if (!baseUrl) throw new Error("AI_BASE_URL is required for live AI blog generation");
  if (!model) throw new Error("AI_MODEL is required for live AI blog generation");
  try {
    const googleBaseUrl = baseUrl.replace(/\/+$/, "").replace(/\/v1beta$/, "") + "/v1beta";
    const languageModel = apiStyle === "gemini"
      ? createGoogleGenerativeAI({ apiKey, baseURL: googleBaseUrl })(model)
      : apiStyle === "responses"
        ? createOpenAI({ apiKey, baseURL: baseUrl })(model)
        : createOpenAI({ apiKey, baseURL: baseUrl }).chat(model);
    const supportsTemperature = !/^gpt-5(?:[.-]|$)/.test(model);
    const result = await generateText({
      model: languageModel,
      system: systemPrompt(jsonMode),
      prompt,
      ...(supportsTemperature ? { temperature: 0.4 } : {}),
      ...(maxTokens === null ? {} : { maxOutputTokens: maxTokens }),
      ...(jsonMode ? { output: Output.json() } : {}),
      maxRetries: 0,
      timeout: timeoutMs,
    });
    if (!result.text.trim()) throw new Error("AI response missing message content");
    const usage = {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      totalTokens: result.usage.totalTokens,
    };
    return { content: result.text, usage, finishReason: result.finishReason };
  } catch (error) {
    if (error instanceof Error && (error.name === "AbortError" || error.message === "This operation was aborted")) {
      throw new Error(`AI request timed out after ${timeoutMs}ms`);
    }
    if (APICallError.isInstance(error)) {
      // 没有状态码的 APICallError 是连接层失败（握手超时、连接断开），provider 根本没回响应。
      // 归到 "AI provider HTTP unknown" 会被 isTransientAiError 判成永久错误，直接跳过主目标重试落到 fallback。
      if (!error.statusCode) throw new Error(`AI request failed: ${clipText(error.message, 1200)}`);
      const failure: AiRetryableError = new Error(`AI provider HTTP ${error.statusCode}: ${clipText(error.responseBody || error.message, 1200)}`);
      const retryAfterMs = parseRetryAfterMs(error.responseHeaders?.["retry-after"]);
      if (retryAfterMs > 0) failure.retryAfterMs = retryAfterMs;
      throw failure;
    }
    if (error instanceof Error && /^AI response missing message content/.test(error.message)) throw error;
    if (NoObjectGeneratedError.isInstance(error)) {
      // jsonMode 下 SDK 只说 "could not parse the response"，看不出是被安全策略拦下、
      // 截断在半截 JSON，还是模型直接写了散文。带上 finishReason 和原始输出才能定位。
      const finishReason = error.finishReason || "unknown";
      throw new Error(
        `AI request failed: ${error.message} finishReason=${finishReason} text=${clipText(error.text, 1200) || "<empty>"}`
      );
    }
    if (error instanceof Error) throw new Error(`AI request failed: ${error.message}`);
    throw new Error(`AI request failed: ${String(error)}`);
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
  timeoutMs = envPositiveNumber("AI_TIMEOUT_MS", 120_000),
  maxTokens = envMaxTokens(),
  jsonMode = false,
  fallbackEnabled,
}: {
  prompt: string;
  primaryConfig?: AiConfig;
  fallbackConfig?: AiConfig;
  timeoutMs?: number;
  maxTokens?: number | null;
  jsonMode?: boolean;
  fallbackEnabled?: boolean;
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
        const result = await callBlogAiOnce({ prompt, ...primaryConfig, timeoutMs, maxTokens, jsonMode });
        const retried = transientRetries > 0 || cooldownRetries > 0;
        return { ...result, config: primaryConfig, usedFallback: false, primaryError: retried ? primaryError : undefined };
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
  if (!(fallbackEnabled ?? envBool("AI_FALLBACK_ENABLED", false))) {
    throw new Error(primaryError || primaryConfigError || "primary AI request failed");
  }
  if (fallbackConfigError) {
    throw new Error(primaryError || fallbackConfigError);
  }
  if (sameAiTarget(primaryConfig, fallbackConfig)) {
    throw new Error(primaryError || "primary and fallback AI targets are identical");
  }

  try {
    const result = await callBlogAiOnce({ prompt, ...fallbackConfig, timeoutMs, maxTokens, jsonMode });
    return { ...result, config: fallbackConfig, usedFallback: true, primaryError: primaryError || primaryConfigError };
  } catch (error) {
    if (error instanceof Error) throw withPriorFailureContext(error, primaryError || primaryConfigError);
    throw new Error(`${String(error)} | primary failure: ${clipText(primaryError || primaryConfigError, 400)}`);
  }
}
