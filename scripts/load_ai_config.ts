// Preload for local CLI use; CI also invokes this once and exports the snapshot to later steps.
import fs from "node:fs";
import { fetchAiSnapshot, runtimeSnapshot, loadRuntimeCredentials } from "./ai_runtime_config.ts";
import { writeStderr, writeStdout } from "./blog_common.ts";

const snapshot = process.env.AI_CONFIG_JSON ? runtimeSnapshot() : await fetchAiSnapshot();
await loadRuntimeCredentials(snapshot);
process.env.AI_CONFIG_JSON = JSON.stringify(snapshot);
process.env.AI_CONFIG_REVISION = String(snapshot.revision);
writeStderr(`[ai-config] pinned revision ${snapshot.revision}`);
for (const [scope, binding] of Object.entries(snapshot.config.bindings)) {
  writeStderr(
    `[ai-config] ${scope}: ${binding.primary.provider}/${binding.primary.model}${binding.fallback ? `; fallback=${binding.fallback.provider}/${binding.fallback.model}` : ""}`
  );
}
if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.env.GITHUB_ENV)
    fs.appendFileSync(
      process.env.GITHUB_ENV,
      `AI_CONFIG_JSON=${JSON.stringify(snapshot)}\nAI_CONFIG_REVISION=${snapshot.revision}\nAI_CONFIG_SCOPE=${process.env.AI_CONFIG_SCOPE === "reddit" ? "reddit" : "blog"}\n`
    );
  if (process.env.GITHUB_ENV && process.env.AI_RUNTIME_CREDENTIALS_JSON)
    fs.appendFileSync(process.env.GITHUB_ENV, `AI_RUNTIME_CREDENTIALS_JSON=${process.env.AI_RUNTIME_CREDENTIALS_JSON}\n`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `ai_revision=${snapshot.revision}\n`);
  writeStdout(JSON.stringify(snapshot));
}
