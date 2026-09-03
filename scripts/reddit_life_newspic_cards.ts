import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { VIDEO_MANIFEST_VERSION, type VideoManifest } from "../video/src/contract.ts";
import type { RedditLifeNewspicSelection } from "./reddit_life_newspic_compose.ts";

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rendererPackageRoot = path.join(scriptRoot, "video");
const COMPOSITION_ID = "RedditLifeNewspic";

function renderFailure(result: ReturnType<typeof spawnSync>): Error {
  const detail = [result.error?.message, result.stdout?.toString(), result.stderr?.toString()].filter(Boolean).join("\n").trim();
  return new Error(`Reddit image-message renderer failed${detail ? `: ${detail}` : ""}`);
}

/** Delegates visual rendering to the reusable Remotion static-card renderer. */
export function renderRedditLifeNewspicCards(selection: RedditLifeNewspicSelection): Buffer[] {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "reddit-life-newspic-render-"));
  try {
    const propsFile = path.join(scratch, "props.json");
    const outputDir = path.join(scratch, "cards");
    const manifest: VideoManifest = {
      version: VIDEO_MANIFEST_VERSION,
      archiveDate: selection.archiveDate,
      title: selection.title,
      question: selection.question,
      cards: selection.cards.map(card => ({ ...card, verbatim: true })),
    };
    fs.writeFileSync(
      propsFile,
      `${JSON.stringify({
        manifest,
      })}\n`,
      "utf8"
    );
    const result = spawnSync(
      "pnpm",
      [
        "run",
        "render:stills",
        "--",
        "--composition",
        COMPOSITION_ID,
        "--props",
        propsFile,
        "--out-dir",
        outputDir,
        "--prefix",
        "card",
        "--count",
        String(selection.cards.length + 1),
      ],
      { cwd: rendererPackageRoot, encoding: "utf8" }
    );
    if (result.status !== 0) throw renderFailure(result);

    return Array.from({ length: selection.cards.length + 1 }, (_, index) => {
      const file = path.join(outputDir, `card-${String(index).padStart(2, "0")}.png`);
      if (!fs.existsSync(file)) throw new Error(`Reddit image-message renderer did not produce ${path.basename(file)}`);
      return fs.readFileSync(file);
    });
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
