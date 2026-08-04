/**
 * Extracts the visible text of every built page into a flat snapshot directory.
 *
 * Astro 7 changes the `compressHTML` default from `true` to `'jsx'`, which collapses
 * whitespace between inline elements using JSX rules: `<span>hello</span><em>world</em>`
 * renders as `helloworld` instead of `hello world`. That regression produces no build
 * error and no log line — the only way to see it is to compare rendered text before and
 * after the upgrade.
 *
 * Comparing text rather than raw HTML keeps hashed asset names, attribute ordering and
 * markup restructuring out of the diff, leaving exactly the whitespace class of change.
 *
 * Usage: node --import tsx scripts/render_text_snapshot.ts <distDir> <outDir>
 */
import fs from "node:fs";
import path from "node:path";

// Element content that is never visible to a reader; dropping it avoids diffing
// inlined CSS/JS payloads whose formatting legitimately changes between versions.
const NON_VISIBLE_TAGS = ["script", "style", "noscript", "template", "svg"];

/**
 * Strips tags with a scanner rather than a regex. Tailwind arbitrary variants put `>` inside
 * quoted class attributes (`class="[&>li>a]:block"`), which a naive /<[^>]+>/ terminates early
 * on, leaking class names into the extracted text. Tracking quote state avoids that.
 */
function stripTags(html: string): string {
  let out = "";
  let index = 0;
  while (index < html.length) {
    const start = html.indexOf("<", index);
    if (start === -1) {
      out += html.slice(index);
      break;
    }
    out += html.slice(index, start);
    // A bare `<` in body text is not a tag start; keep it verbatim.
    if (!/[a-zA-Z/!?]/.test(html[start + 1] || "")) {
      out += "<";
      index = start + 1;
      continue;
    }
    let cursor = start + 1;
    let quote = "";
    while (cursor < html.length) {
      const char = html[cursor];
      if (quote) {
        if (char === quote) quote = "";
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        break;
      }
      cursor += 1;
    }
    index = cursor + 1;
  }
  return out;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&"); // last, so already-decoded output is not decoded twice
}

function visibleText(html: string): string {
  let text = html;
  for (const tag of NON_VISIBLE_TAGS) {
    text = text.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi"), " ");
  }
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  // A tag boundary is not itself a space: dropping the tag must not join or split words,
  // so the tag is replaced by nothing and surrounding whitespace is preserved as authored.
  text = decodeEntities(stripTags(text));
  // Normalize line structure but keep intra-line spacing, which is what 'jsx' mode changes.
  return text
    .split("\n")
    .map(line => line.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else if (entry.name.endsWith(".html")) found.push(full);
  }
  return found;
}

const [distDir, outDir] = process.argv.slice(2);
if (!distDir || !outDir) throw new Error("usage: render_text_snapshot.ts <distDir> <outDir>");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const pages = walk(distDir).sort();
for (const page of pages) {
  const rel = path.relative(distDir, page);
  const target = path.join(outDir, `${rel.replace(/[/\\]/g, "__")}.txt`);
  fs.writeFileSync(target, `${visibleText(fs.readFileSync(page, "utf8"))}\n`);
}
process.stdout.write(`${pages.length} pages -> ${outDir}\n`);
