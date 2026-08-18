import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { callBlogAi, callBlogAiWithFailover, parseResponsesSse } from "../scripts/blog_ai_client.ts";
import { generateJsonStageWithRetries } from "../scripts/ai_json_stage.ts";
import { tempDir, withMocks } from "./helpers/mocks.ts";

const CHAT_OK = JSON.stringify({ choices: [{ message: { content: "## 标题\n\n" + "有效正文".repeat(80) } }] });

function sseEvent(type: string, payload: Record<string, unknown>): string {
  return `event: ${type}\ndata: ${JSON.stringify({ type, ...payload })}`;
}

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
        return new Response(CHAT_OK, { status: 200 });
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
        return new Response(CHAT_OK, { status: 200 });
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
});

test("AI client retries a reasoning-only length-truncated fallback response with a larger output budget", async () => {
  const requestBodies: Record<string, unknown>[] = [];
  const result = await withMocks(
    {
      env: { AI_PRIMARY_RETRY_ATTEMPTS: "1", AI_FALLBACK_ENABLED: "true" },
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
        requestBodies.push(body);
        if (body.model === "primary-model") {
          return new Response(JSON.stringify({ error: { message: "insufficient balance" } }), { status: 403 });
        }
        if (requestBodies.filter(request => request.model === "deepseek-v4-flash").length === 1) {
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: "", reasoning_content: "reasoning consumed the budget" }, finish_reason: "length" }],
            }),
            { status: 200 },
          );
        }
        return new Response(CHAT_OK, { status: 200 });
      },
    },
    () =>
      callBlogAiWithFailover({
        prompt: "hello",
        primaryConfig: { apiKey: "primary-key", baseUrl: "https://primary.example.com/v1", model: "primary-model" },
        fallbackConfig: { apiKey: "fallback-key", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
      }),
  );

  const fallbackRequests = requestBodies.filter(request => request.model === "deepseek-v4-flash");
  assert.equal(result.usedFallback, true);
  assert.match(result.content, /^## 标题/);
  assert.equal(requestBodies.filter(request => request.model === "primary-model").length, 1);
  assert.equal(fallbackRequests.length, 2);
  assert.ok(Number(fallbackRequests[1].max_tokens) > Number(fallbackRequests[0].max_tokens));
});

test("AI client bounds the larger-budget retry for repeated reasoning-only responses", async () => {
  let fallbackCalls = 0;
  await withMocks(
    {
      env: { AI_PRIMARY_RETRY_ATTEMPTS: "1", AI_FALLBACK_ENABLED: "true" },
      fetch: async (_input, init) => {
        const body = JSON.parse(String(init?.body || "{}")) as { model?: string };
        if (body.model === "primary-model") {
          return new Response(JSON.stringify({ error: { message: "insufficient balance" } }), { status: 403 });
        }
        fallbackCalls += 1;
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "", reasoning_content: "reasoning consumed the budget" }, finish_reason: "length" }],
          }),
          { status: 200 },
        );
      },
    },
    () =>
      assert.rejects(
        () =>
          callBlogAiWithFailover({
            prompt: "hello",
            primaryConfig: { apiKey: "primary-key", baseUrl: "https://primary.example.com/v1", model: "primary-model" },
            fallbackConfig: { apiKey: "fallback-key", baseUrl: "https://api.deepseek.com", model: "deepseek-v4-flash" },
          }),
        /exhausted output token budget before message content/,
      ),
  );
  assert.equal(fallbackCalls, 2);
});

test("Responses API accepts a completed non-streaming JSON response", async () => {
  const content = await withMocks(
    {
      fetch: async () =>
        new Response(
          JSON.stringify({
            object: "response",
            status: "completed",
            output: [
              { type: "reasoning" },
              { type: "message", content: [{ type: "output_text", text: "## 标题\n\n正文" }] },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    },
    () =>
      callBlogAi({
        prompt: "hello",
        apiKey: "key",
        baseUrl: "https://api.example.com/v1",
        model: "test-model",
        apiStyle: "responses",
      }),
  );

  assert.equal(content, "## 标题\n\n正文");
});

test("Responses API accepts a completed JSON response with a mislabelled content type", async () => {
  const content = await withMocks(
    {
      fetch: async () =>
        new Response(
          JSON.stringify({
            object: "response",
            status: "completed",
            output: [
              { type: "reasoning" },
              { type: "message", content: [{ type: "output_text", text: "## 标题\n\n正文" }] },
            ],
          }),
          { status: 200, headers: { "Content-Type": "text/plain" } },
        ),
    },
    () =>
      callBlogAi({
        prompt: "hello",
        apiKey: "key",
        baseUrl: "https://api.example.com/v1",
        model: "test-model",
        apiStyle: "responses",
      }),
  );

  assert.equal(content, "## 标题\n\n正文");
});

test("Responses API surfaces provider errors from non-streaming JSON responses", async () => {
  await withMocks(
    {
      fetch: async () =>
        new Response(JSON.stringify({ object: "response", status: "failed", error: { message: "provider capacity exhausted" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    },
    () =>
      assert.rejects(
        () =>
          callBlogAi({
            prompt: "hello",
            apiKey: "key",
            baseUrl: "https://api.example.com/v1",
            model: "test-model",
            apiStyle: "responses",
          }),
        error => {
          assert.ok(error instanceof Error);
          assert.doesNotMatch(error.message, /missing message content/);
          assert.match(error.message, /AI responses API error: provider capacity exhausted/);
          return true;
        },
      ),
  );
});

// The /responses payload shape has caused repeated production breakage (input as string vs list,
// JSON instruction placement, unsupported `text` field). This is the contract guard for it.
test("Responses API contract: SSE parsing, payload shape, and JSON-mode instruction", async () => {
  // Completed text wins over accumulated deltas; deltas are the fallback when no completion arrives.
  const withCompletion = [
    sseEvent("response.output_text.delta", { delta: "他" }),
    sseEvent("response.output_text.delta", { delta: "好" }),
    sseEvent("response.completed", { response: { output: [{ content: [{ type: "output_text", text: "他好世界" }] }] } }),
    "data: [DONE]",
  ].join("\n\n");
  assert.equal(parseResponsesSse(withCompletion), "他好世界");
  const deltaOnly = [sseEvent("response.output_text.delta", { delta: "A" }), sseEvent("response.output_text.delta", { delta: "B" })].join("\n\n");
  assert.equal(parseResponsesSse(deltaOnly), "AB");
  assert.throws(
    () => parseResponsesSse(sseEvent("response.failed", { response: { error: { message: "quota exceeded" } } })),
    /AI responses API error: quota exceeded/,
  );

  const completedSse = (text: string) =>
    new Response(sseEvent("response.completed", { response: { output: [{ content: [{ type: "output_text", text }] }] } }), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

  // JSON mode: the instruction is prefixed into the input text, not sent as a `text`/`response_format` field.
  const jsonCalls: { url: string; body: Record<string, unknown> }[] = [];
  const content = await withMocks(
    {
      fetch: async (input, init) => {
        jsonCalls.push({ url: String(input), body: JSON.parse(String(init?.body || "{}")) as Record<string, unknown> });
        return completedSse("## 标题\n\n正文");
      },
    },
    () =>
      callBlogAi({
        prompt: "hello",
        apiKey: "key",
        baseUrl: "https://www.right.codes/codex/v1",
        model: "gpt-5.6-terra",
        apiStyle: "responses",
        jsonMode: true,
      }),
  );
  assert.equal(content, "## 标题\n\n正文");
  assert.equal(jsonCalls.length, 1);
  assert.equal(jsonCalls[0].url, "https://www.right.codes/codex/v1/responses"); // /responses appended exactly once
  assert.deepEqual(jsonCalls[0].body.input, [{ role: "user", content: "Return a valid json object only.\n\nhello" }]);
  assert.equal("text" in jsonCalls[0].body, false);
  assert.equal("messages" in jsonCalls[0].body, false);

  // Non-JSON mode leaves the prompt untouched.
  let proseBody: Record<string, unknown> | undefined;
  await withMocks(
    {
      fetch: async (_input, init) => {
        proseBody = JSON.parse(String(init?.body || "{}"));
        return completedSse("正文");
      },
    },
    () =>
      callBlogAi({
        prompt: "preserve this prompt",
        apiKey: "key",
        baseUrl: "https://www.right.codes/codex/v1",
        model: "gpt-5.6-terra",
        apiStyle: "responses",
      }),
  );
  assert.deepEqual(proseBody?.input, [{ role: "user", content: "preserve this prompt" }]);
  assert.equal("text" in (proseBody || {}), false);
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
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });
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
