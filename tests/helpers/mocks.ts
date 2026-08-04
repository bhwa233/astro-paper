import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type FetchHandler = (input: string | URL | Request, init?: RequestInit) => Response | Promise<Response>;

export interface MockOptions {
  /** Replaces globalThis.fetch for the duration of the callback. */
  fetch?: FetchHandler;
  /** Env vars to set; `undefined` deletes the var. Previous values are restored afterwards. */
  env?: Record<string, string | undefined>;
}

/**
 * Runs `body` with a stubbed fetch and/or patched env, restoring both afterwards
 * even when the callback throws. Replaces the hand-rolled save/restore blocks that
 * used to be copied into every network- or env-sensitive test.
 */
export async function withMocks<T>(options: MockOptions, body: () => T | Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  const previousEnv = Object.entries(options.env || {}).map(([name, _value]) => [name, process.env[name]] as const);
  if (options.fetch) globalThis.fetch = options.fetch as typeof fetch;
  for (const [name, value] of Object.entries(options.env || {})) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    return await body();
  } finally {
    if (options.fetch) globalThis.fetch = originalFetch;
    for (const [name, value] of previousEnv) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const tempDirs: string[] = [];

/** Creates a temp directory that is removed when the test process exits. */
export function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `astro-paper-${prefix}-`));
  tempDirs.push(dir);
  return dir;
}

/** Creates a temp file path (not the file itself) inside an auto-cleaned directory. */
export function tempFile(prefix: string, name: string): string {
  return path.join(tempDir(prefix), name);
}

process.on("exit", () => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

/** Reads a checked-in fixture from tests/fixtures. */
export function fixture(...segments: string[]): string {
  return fs.readFileSync(path.join(process.cwd(), "tests/fixtures", ...segments), "utf8");
}

/** Absolute path to a checked-in fixture. */
export function fixturePath(...segments: string[]): string {
  return path.join(process.cwd(), "tests/fixtures", ...segments);
}
