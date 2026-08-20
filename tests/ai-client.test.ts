import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { APICallError } from "ai";

import { callBlogAiWithFailover } from "../scripts/blog_ai_client.ts";
import { generateJsonStageWithRetries } from "../scripts/ai_json_stage.ts";
import { tempDir, withMocks } from "./helpers/mocks.ts";

const CHAT_OK = JSON.stringify({ choices: [{ index: 0, message: { content: "## 标题\n\n" + "有效正文".repeat(80) } }] });
const JSON_HEADERS = { "Content-Type": "application/json" };

test("AI client fails over to the fallback provider only when the primary is exhausted", async () => {
  // Failover path: primary 503s, fallback answers.
  const failoverCalls: string[] = [];
  const result = await withMocks(
    {
      // AI_PRIMARY_RETRY_ATTEMPTS=1 isolates failover from the transient-retry path.
      env: { AI_PRIMARY_RETRY_ATTEMPTS: "1", AI_FALLBACK_ENABLED: "true" },
      fetch: async (input, init) => {
        failoverCalls.push(String(input));
        const body = JSON.parse(String(init?.body || "{}")) as { model?: string };
        if (body.model === "primary-model") {
          return new Response(JSON.stringify({ error: { message: "upstream overloaded" } }), { status: 503 });
        }
        return new Response(CHAT_OK, { status: 200, headers: JSON_HEADERS });
      },
    },
    () =>
      callBlogAiWithFailover({
        prompt: "hello",
        primaryConfig: { apiKey: "primary-key", baseUrl: "https://primary.example.com/v1", model: "primary-model" },
        fallbackConfig: { apiKey: "fallback-key", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
        timeoutMs: 25,
      }),
  );
  assert.equal(result.usedFallback, true);
  assert.equal(result.config.model, "deepseek-v4-flash");
  assert.equal(result.config.baseUrl, "https://api.deepseek.com");
  assert.match(result.content, /^## 标题/);
  assert.deepEqual(failoverCalls, ["https://primary.example.com/v1/chat/completions", "https://api.deepseek.com/chat/completions"]);

  // Fallback disabled (the default): the run fails instead of silently degrading to a weaker model.
  const disabledCalls: string[] = [];
  await withMocks(
    {
      env: { AI_PRIMARY_RETRY_ATTEMPTS: "1", AI_FALLBACK_ENABLED: undefined },
      fetch: async input => {
        disabledCalls.push(String(input));
        return new Response(JSON.stringify({ error: { message: "upstream overloaded" } }), { status: 503 });
      },
    },
    () =>
      assert.rejects(
        () =>
          callBlogAiWithFailover({
            prompt: "hello",
            primaryConfig: { apiKey: "primary-key", baseUrl: "https://primary.example.com/v1", model: "primary-model", apiStyle: "chat" },
            fallbackConfig: { apiKey: "fallback-key", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", apiStyle: "chat" },
          }),
        /AI provider HTTP 503/,
      ),
  );
  assert.deepEqual(disabledCalls, ["https://primary.example.com/v1/chat/completions"]);

  // A dropped connection is retried on the primary rather than handed to the fallback.
  const retryCalls: string[] = [];
  const retried = await withMocks(
    {
      env: { AI_PRIMARY_RETRY_DELAY_MS: "1" },
      fetch: async input => {
        retryCalls.push(String(input));
        if (retryCalls.length === 1) throw new TypeError("fetch failed");
        return new Response(CHAT_OK, { status: 200, headers: JSON_HEADERS });
      },
    },
    () =>
      callBlogAiWithFailover({
        prompt: "hello",
        primaryConfig: { apiKey: "primary-key", baseUrl: "https://primary.example.com/v1", model: "primary-model", apiStyle: "chat" },
        fallbackConfig: { apiKey: "fallback-key", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", apiStyle: "chat" },
      }),
  );
  assert.equal(retried.usedFallback, false);
  assert.equal(retried.config.model, "primary-model");
  assert.deepEqual(retryCalls, ["https://primary.example.com/v1/chat/completions", "https://primary.example.com/v1/chat/completions"]);

  // 2026-08-19: 握手超时被 provider 包成没有状态码的 APICallError，曾被当成永久错误直接落到 fallback。
  const timeoutCalls: string[] = [];
  const recovered = await withMocks(
    {
      env: { AI_PRIMARY_RETRY_DELAY_MS: "1" },
      fetch: async input => {
        timeoutCalls.push(String(input));
        if (timeoutCalls.length === 1) {
          throw new APICallError({
            message: "Cannot connect to API: Headers Timeout Error",
            url: String(input),
            requestBodyValues: {},
            isRetryable: true,
          });
        }
        return new Response(CHAT_OK, { status: 200, headers: JSON_HEADERS });
      },
    },
    () =>
      callBlogAiWithFailover({
        prompt: "hello",
        primaryConfig: { apiKey: "primary-key", baseUrl: "https://primary.example.com/v1", model: "primary-model", apiStyle: "chat" },
        fallbackConfig: { apiKey: "fallback-key", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash", apiStyle: "chat" },
      }),
  );
  assert.equal(recovered.usedFallback, false);
  assert.deepEqual(timeoutCalls, ["https://primary.example.com/v1/chat/completions", "https://primary.example.com/v1/chat/completions"]);
});

test("AI client sends Gemini through its native provider and fails over to OpenAI Chat", async () => {
  const calls: Array<{ url: string; headers: HeadersInit | undefined }> = [];
  const result = await withMocks(
    {
      env: { AI_PRIMARY_RETRY_ATTEMPTS: "1", AI_FALLBACK_ENABLED: "true" },
      fetch: async (input, init) => {
        calls.push({ url: String(input), headers: init?.headers });
        if (String(input).includes("rightapi.ai/gemini")) {
          return new Response(JSON.stringify({ error: { message: "provider overloaded" } }), { status: 503 });
        }
        return new Response(CHAT_OK, { status: 200, headers: JSON_HEADERS });
      },
    },
    () =>
      callBlogAiWithFailover({
        prompt: "hello",
        primaryConfig: { apiKey: "primary-key", baseUrl: "https://rightapi.ai/gemini", model: "gemini-3.7-flash", apiStyle: "gemini" },
        fallbackConfig: { apiKey: "fallback-key", baseUrl: "https://rightapi.ai/codex/v1", model: "gpt-5.6-luna", apiStyle: "chat" },
      }),
  );

  assert.equal(result.usedFallback, true);
  assert.equal(result.config.model, "gpt-5.6-luna");
  assert.match(result.content, /^## 标题/);
  assert.deepEqual(calls.map(call => call.url), [
    "https://rightapi.ai/gemini/v1beta/models/gemini-3.7-flash:generateContent",
    "https://rightapi.ai/codex/v1/chat/completions",
  ]);
  assert.equal(new Headers(calls[0].headers).get("x-goog-api-key"), "primary-key");
});

test("JSON generation stages retry malformed output with JSON mode and retain diagnostics", async () => {
  const artifactsDir = tempDir("json-stage");
  const requestBodies: Record<string, unknown>[] = [];
  let calls = 0;
  const result = await withMocks(
    {
      env: {
        AI_API_KEY: "test-key",
        AI_BASE_URL: "https://api.example.com/v1",
        AI_MODEL: "test-model",
        AI_API_STYLE: "chat",
        AI_FALLBACK_ENABLED: "false",
        AI_RETRY_ATTEMPTS: "2",
        AI_RETRY_DELAY_MS: "0",
      },
      fetch: async (_input, init) => {
        requestBodies.push(JSON.parse(String(init?.body || "{}")) as Record<string, unknown>);
        calls += 1;
        const content = calls === 1 ? '{"summary":"unterminated}' : '{"summary":"valid"}';
        return new Response(JSON.stringify({ choices: [{ index: 0, message: { content } }] }), { status: 200, headers: JSON_HEADERS });
      },
    },
    () =>
      generateJsonStageWithRetries({
        task: "tech-daily",
        stage: "tech-daily item 7 summary",
        artifactPrefix: "item-007-summary",
        prompt: "Return one JSON object.",
        model: "test-model",
        artifactsDir,
        parse: (content: string) => JSON.parse(content) as { summary: string },
      }),
  );

  assert.deepEqual(result, { summary: "valid" });
  assert.equal(calls, 2);
  assert.deepEqual(requestBodies.map(body => body.response_format), [{ type: "json_object" }, { type: "json_object" }]);
  assert.match(String((requestBodies[1].messages as { content: string }[])[1].content), /无法通过 JSON 解析/);
  const artifact = (name: string) => fs.readFileSync(path.join(artifactsDir, `tech-daily-item-007-summary-${name}`), "utf8");
  assert.equal(artifact("response-attempt-1.json").trim(), '{"summary":"unterminated}');
  assert.equal(artifact("response-attempt-2.json").trim(), '{"summary":"valid"}');
  assert.match(artifact("error-attempt-1.txt"), /Unterminated string/);
  assert.match(artifact("retry-prompt-attempt-2.md"), /完整、合法且字段齐全/);
});
