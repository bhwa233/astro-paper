/**
 * `import()` that Node executes, not Vite.
 *
 * This module used to be a published npm package, so every `import()` in it ran
 * as plain Node ESM out of `node_modules`. Embedded in the consuming repo it is
 * part of Astro's Vite module graph instead, and a literal `import()` compiles
 * to a call into Vite's module runner. Two things then break that never could
 * before:
 *
 *   - The `astro:build:done` hook runs after the runner has been torn down, so
 *     loading the project config there fails with "Vite module runner has been
 *     closed".
 *   - Optional native dependencies resolved by bare specifier (`sharp`) go
 *     through Vite's resolver rather than Node's.
 *
 * `/* @vite-ignore *​/` only silences the analysis warning; it does not change
 * who performs the import. A `new Function` body is opaque to the bundler, so
 * the `import()` inside it stays Node's own.
 *
 * Callers must pass an absolute `file://` URL or a bare package specifier —
 * resolution is Node's, relative to this process, not to the caller's module.
 */
const nativeImport = new Function(
  'specifier',
  'return import(specifier)'
) as (specifier: string) => Promise<unknown>

export function importAtRuntime<T = unknown>(specifier: string): Promise<T> {
  return nativeImport(specifier) as Promise<T>
}
