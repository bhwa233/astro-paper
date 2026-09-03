// 模型 JSON 阶段的通用重试与产物留存。
// 中间阶段和最终成文一样会拿到截断的 JSON，因此每次尝试的响应、重试提示词和错误都要落盘，
// 让 CI 产物能直接指认是哪一阶段、第几次尝试失败的。
import fs from "node:fs";
import path from "node:path";
import { ensureDir, envPositiveInt, sleep, writeStderr } from "./blog_common.ts";
import { type AiCallResult, callBlogAiWithFailover, envAiConfig, envFallbackAiConfig } from "./blog_ai_client.ts";

export function writeAiArtifact(artifactsDir: string, task: string, name: string, content: string): string {
  if (!artifactsDir) return "";
  ensureDir(artifactsDir);
  const file = path.join(artifactsDir, `${task}-${name}`);
  fs.writeFileSync(file, `${content.trim()}\n`, "utf8");
  return file;
}

export async function callAi(prompt: string, model: string, jsonMode = false): Promise<AiCallResult> {
  const result = await callBlogAiWithFailover({
    prompt,
    primaryConfig: envAiConfig({ model }),
    fallbackConfig: envFallbackAiConfig(),
    jsonMode,
  });
  if (result.usedFallback) {
    writeStderr(
      `WARN: primary AI request failed; using fallback model ${result.config.model} via ${result.config.baseUrl}${result.primaryError ? ` | primary failure: ${result.primaryError}` : ""}`
    );
  }
  return result;
}

export function retryAttempts(): number {
  return envPositiveInt("AI_RETRY_ATTEMPTS", 3);
}

// jitterMs：同一批条目并发提交时，固定退避会让所有重试撞在同一毫秒上；抖动把它们摊开。
export function retryDelayMs(attempt: number, jitterMs = 0): number {
  const raw = Number(process.env.AI_RETRY_DELAY_MS || "10000");
  const base = Number.isFinite(raw) && raw >= 0 ? raw : 10_000;
  const delay = attempt <= 1 ? 0 : base * (attempt - 1);
  return delay > 0 && jitterMs > 0 ? delay + Math.floor(Math.random() * jitterMs) : delay;
}

export type JsonStageOptions<T> = {
  task: string;
  stage: string;
  artifactPrefix: string;
  prompt: string;
  model: string;
  artifactsDir: string;
  parse: (content: string) => T;
  /** 逐条目并发调用时给一个上界，避开同批重试的惊群。 */
  jitterMs?: number;
  /** 不给就抛错；给了则由它把「重试用尽」翻译成一个可继续处理的值（Reddit 逐帖降级）。 */
  onExhausted?: (message: string) => T;
};

export async function generateJsonStageWithRetries<T>({
  task,
  stage,
  artifactPrefix,
  prompt,
  model,
  artifactsDir,
  parse,
  jitterMs = 0,
  onExhausted,
}: JsonStageOptions<T>): Promise<T> {
  const attempts = retryAttempts();
  let lastError = "";
  let attemptPrompt = prompt;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    await sleep(retryDelayMs(attempt, jitterMs));
    if (attempt > 1) writeAiArtifact(artifactsDir, task, `${artifactPrefix}-retry-prompt-attempt-${attempt}.md`, attemptPrompt);
    try {
      const response = await callAi(attemptPrompt, model, true);
      writeAiArtifact(artifactsDir, task, `${artifactPrefix}-response-attempt-${attempt}.json`, response.content);
      return parse(response.content);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      writeAiArtifact(artifactsDir, task, `${artifactPrefix}-error-attempt-${attempt}.txt`, lastError);
      if (attempt < attempts) {
        attemptPrompt = `${prompt.trim()}\n\n---\n\n上一轮 ${stage} 输出无法通过 JSON 解析或质量校验，原因：${lastError}\n请重新返回完整、合法且字段齐全的 JSON 对象，不要输出解释或代码围栏。`;
        writeStderr(`WARN: ${stage} attempt ${attempt}/${attempts} failed; retrying with JSON validation feedback: ${lastError}`);
      }
    }
  }
  const message = `${stage} failed after ${attempts} attempts: ${lastError}`;
  if (onExhausted) return onExhausted(message);
  throw new Error(message);
}
