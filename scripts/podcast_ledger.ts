import path from "node:path";
import { readJsonLedger, repoRoot, writeJsonLedger } from "./blog_common.ts";
import { type PodcastFingerprintInput, podcastFingerprints } from "./foreign_tech_podcast_dedupe.ts";

// 已总结播客账本：在抓取/生成时记录数据源真值（GUID/链接/音频/canonicalId），
// 作为去重依据，比事后解析模型生成的文章正文更可靠。
export type SummarizedEpisodeEntry = PodcastFingerprintInput & {
  archivedAt: string; // 归档（运行）日期
  postPath?: string; // 归档文章相对路径
};

type LedgerFile = { version: number; episodes: SummarizedEpisodeEntry[] };

export function summarizedLedgerPath(): string {
  return process.env.PODCAST_SUMMARIZED_LEDGER_FILE || path.join(repoRoot(), "data/daily-podcasts/summarized.json");
}

// 解析失败必须抛错、不得静默降级成空账本，这条由 readJsonLedger 统一持有（三个账本同约定）。
function readLedger(file: string): LedgerFile {
  return readJsonLedger<LedgerFile>(file, "podcast summarized ledger", { version: 1, episodes: [] }, raw => {
    const parsed = raw as Partial<LedgerFile>;
    if (!Array.isArray(parsed.episodes)) throw new Error(`invalid podcast summarized ledger structure: ${file}`);
    return { version: parsed.version || 1, episodes: parsed.episodes };
  });
}

// 加载全部已总结指纹（含当天）：去重以指纹为准，不依赖归档日期，幂等更稳。
export function loadSummarizedFingerprints(file = summarizedLedgerPath()): Set<string> {
  const set = new Set<string>();
  for (const entry of readLedger(file).episodes) {
    for (const fingerprint of podcastFingerprints(entry)) set.add(fingerprint);
  }
  return set;
}

export function isEpisodeSummarized(set: Set<string>, episode: PodcastFingerprintInput): boolean {
  return podcastFingerprints(episode).some(fingerprint => set.has(fingerprint));
}

// 归档成功后调用：按指纹（或同一 postPath）命中则 upsert 更新那条记录，否则追加。
// force 重生时只刷新对应记录，不清空当天，也不产生重复条目。
export function appendSummarizedEpisode(episode: PodcastFingerprintInput, meta: { archivedAt: string; postPath?: string }, file = summarizedLedgerPath()): void {
  const ledger = readLedger(file);
  const fingerprints = new Set(podcastFingerprints(episode));
  const entry: SummarizedEpisodeEntry = {
    title: episode.title,
    show: episode.show,
    link: episode.link,
    audioUrl: episode.audioUrl,
    guid: episode.guid,
    canonicalId: episode.canonicalId,
    date: episode.date,
    archivedAt: meta.archivedAt,
    postPath: meta.postPath,
  };
  const existingIndex = ledger.episodes.findIndex(
    candidate => (meta.postPath && candidate.postPath === meta.postPath) || podcastFingerprints(candidate).some(fingerprint => fingerprints.has(fingerprint)),
  );
  if (existingIndex >= 0) ledger.episodes[existingIndex] = entry;
  else ledger.episodes.push(entry);
  writeJsonLedger(file, ledger);
}
