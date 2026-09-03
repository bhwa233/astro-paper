// 「已推荐过什么」账本的通用实现：nyt-books 与 mdblist 的去重逻辑此前是两份逐行重复的拷贝。
// 各任务只提供身份 key 的算法，读写、结构校验、同篇重跑替换都在这里。
// 与 magazine_ledger.ts 的分工：那个记录「某一期刊物是否归档过」（一篇一条），
// 这个记录「某个作品是否被推荐过」（一篇多条）。
import { compact, readJsonLedger, writeJsonLedger } from "./blog_common.ts";

export type Recommendation = { key: string; title: string };

export type Archived<T extends Recommendation> = T & {
  archivedAt: string;
  postPath: string;
};

type Ledger<T extends Recommendation> = {
  version: 1;
  recommendations: Archived<T>[];
};

export type RecommendationLedgerSpec<T extends Recommendation> = {
  /** 错误信息里的任务名，例如 "NYT books" / "MDBList"。 */
  label: string;
  /** 从条目的身份字段重算 key；存量校验与新增校验都用它，防止 key 与字段漂移。 */
  expectedKey: (entry: T) => string;
};

function readLedger<T extends Recommendation>(spec: RecommendationLedgerSpec<T>, file: string): Ledger<T> {
  return readJsonLedger<Ledger<T>>(file, `${spec.label} recommendation ledger`, { version: 1, recommendations: [] }, raw => {
    const parsed = raw as Partial<Ledger<T>>;
    if (parsed.version !== 1 || !Array.isArray(parsed.recommendations)) {
      throw new Error(`invalid ${spec.label} recommendation ledger structure: ${file}`);
    }
    for (const entry of parsed.recommendations) {
      if (entry.key !== spec.expectedKey(entry) || !compact(entry.title) || !compact(entry.archivedAt) || !compact(entry.postPath)) {
        throw new Error(`invalid ${spec.label} recommendation ledger entry: ${entry.key || "missing key"}`);
      }
    }
    return parsed as Ledger<T>;
  });
}

export function loadRecommendations<T extends Recommendation>(spec: RecommendationLedgerSpec<T>, file: string): Archived<T>[] {
  return readLedger(spec, file).recommendations;
}

export function loadRecommendationKeys<T extends Recommendation>(spec: RecommendationLedgerSpec<T>, file: string, excludePostPath = ""): Set<string> {
  return new Set(
    readLedger(spec, file)
      .recommendations.filter(entry => !excludePostPath || entry.postPath !== excludePostPath)
      .map(entry => entry.key)
  );
}

export function appendRecommendations<T extends Recommendation>(
  spec: RecommendationLedgerSpec<T>,
  recommendations: T[],
  meta: { archivedAt: string; postPath: string },
  file: string
): void {
  if (!recommendations.length) throw new Error(`cannot archive an empty ${spec.label} recommendation selection`);
  const unique = new Map<string, T>();
  for (const recommendation of recommendations) {
    const expected = spec.expectedKey(recommendation);
    if (recommendation.key !== expected) throw new Error(`${spec.label} recommendation key mismatch: ${recommendation.key} vs ${expected}`);
    if (!compact(recommendation.title)) throw new Error(`${spec.label} recommendation ${recommendation.key} is missing title`);
    unique.set(recommendation.key, recommendation);
  }
  if (unique.size !== recommendations.length) throw new Error(`${spec.label} recommendation selection contains duplicate identities`);

  const ledger = readLedger(spec, file);
  const newKeys = new Set(unique.keys());
  // 同一篇文章重跑：先撤掉它上次写入的行，再撤掉本次要写的 key 在别处的残留，最后整批追加。
  ledger.recommendations = ledger.recommendations.filter(entry => entry.postPath !== meta.postPath && !newKeys.has(entry.key));
  ledger.recommendations.push(
    ...[...unique.values()].map(recommendation => ({
      ...recommendation,
      archivedAt: meta.archivedAt,
      postPath: meta.postPath,
    }))
  );
  writeJsonLedger(file, ledger);
}
