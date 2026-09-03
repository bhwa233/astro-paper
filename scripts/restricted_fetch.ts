export type RestrictedFetchOptions = {
  allowedHosts: readonly string[];
  maxBytes: number;
  timeoutMs?: number;
  maxRedirects?: number;
  retries?: number;
  headers?: Record<string, string>;
};

export type RestrictedFetchResult = {
  bytes: Buffer;
  contentType: string;
  finalUrl: string;
};

export function validateRestrictedUrl(raw: string, allowedHosts: readonly string[]): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error(`only HTTPS URLs are allowed: ${raw}`);
  if (url.username || url.password) throw new Error(`URL credentials are not allowed: ${raw}`);
  const hosts = new Set(allowedHosts.map(host => host.toLowerCase()));
  if (!hosts.has(url.hostname.toLowerCase())) throw new Error(`host is not allowed: ${url.hostname}`);
  return url;
}

async function restrictedFetchOnce(rawUrl: string, options: RestrictedFetchOptions): Promise<RestrictedFetchResult> {
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxRedirects = options.maxRedirects ?? 5;
  let url = validateRestrictedUrl(rawUrl, options.allowedHosts);

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent": "astro-paper-newsletter-translator/1.0",
          Accept: "application/rss+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.1",
          ...options.headers,
        },
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error(`request timed out after ${timeoutMs}ms for ${url}`);
      throw error;
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      if (redirectCount === maxRedirects) throw new Error(`too many redirects for ${rawUrl}`);
      const location = response.headers.get("location");
      if (!location) throw new Error(`redirect missing Location for ${url}`);
      url = validateRestrictedUrl(new URL(location, url).href, options.allowedHosts);
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);

    const declaredLength = Number(response.headers.get("content-length") || "0");
    if (Number.isFinite(declaredLength) && declaredLength > options.maxBytes) {
      throw new Error(`response exceeded ${options.maxBytes} bytes for ${url}`);
    }
    if (!response.body) throw new Error(`response body missing for ${url}`);

    const chunks: Uint8Array[] = [];
    let size = 0;
    const bodyTimer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > options.maxBytes) throw new Error(`response exceeded ${options.maxBytes} bytes for ${url}`);
        chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") throw new Error(`response body timed out after ${timeoutMs}ms for ${url}`);
      throw error;
    } finally {
      clearTimeout(bodyTimer);
    }
    return {
      bytes: Buffer.concat(chunks),
      contentType: (response.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase(),
      finalUrl: url.href,
    };
  }
  throw new Error(`too many redirects for ${rawUrl}`);
}

function isRetriable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /HTTP (?:429|5\d\d)\b|timed out|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network/i.test(error.message);
}

export async function restrictedFetch(rawUrl: string, options: RestrictedFetchOptions): Promise<RestrictedFetchResult> {
  const retries = options.retries ?? 2;
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await restrictedFetchOnce(rawUrl, options);
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetriable(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

export async function restrictedFetchText(rawUrl: string, options: RestrictedFetchOptions): Promise<RestrictedFetchResult & { text: string }> {
  const result = await restrictedFetch(rawUrl, options);
  return { ...result, text: result.bytes.toString("utf8") };
}
