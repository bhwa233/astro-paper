import assert from "node:assert/strict";
import test from "node:test";
import { forumTop10MarkdownFromSummaries, parseForumItemSummary, parseForumTop10Payload } from "../scripts/forum_top10_compose.ts";
import { FORUM_TOP10_CONTRACT_VERSION, type ForumTop10Item, renderForumTop10Source } from "../scripts/forum_top10_source.ts";

function item(itemId: number): ForumTop10Item {
  const platform = itemId <= 10 ? "5ch" : "DC Inside";
  const rank = itemId <= 10 ? itemId : itemId - 10;
  return {
    itemId,
    platform,
    rank,
    title: `${platform} 原题 [${rank}] *保持不变*`,
    url: platform === "5ch"
      ? `https://example.5ch.io/test/read.cgi/board/${1000 + rank}/`
      : `https://gall.dcinside.com/board/view/?id=dcbest&no=${2000 + rank}`,
    board: `board-${rank}`,
    snapshotAt: "2099-01-02T14:30:00.000Z",
    views: platform === "DC Inside" ? rank * 100 : null,
    recommendations: platform === "DC Inside" ? rank * 10 : null,
    commentCount: rank * 5,
    body: "原帖正文",
    comments: ["第一条评论"],
    imagesIgnored: 0,
    detailError: "",
    titleZh: `第 ${rank} 条中文标题`,
    summary: itemId === 3 ? "" : `第 ${rank} 条帖子的中文摘要，保留原帖信息和评论区讨论。`,
    summaryError: itemId === 3 ? "model failed" : "",
  };
}

function source(items = Array.from({ length: 20 }, (_, index) => item(index + 1))): string {
  return renderForumTop10Source({
    contract_version: FORUM_TOP10_CONTRACT_VERSION,
    snapshot_at: "2099-01-02T14:30:00.000Z",
    items,
  });
}

test("forum Top 10 composition displays translated titles while preserving every original rank, title, and link", () => {
  const markdown = forumTop10MarkdownFromSummaries(source());
  assert.equal((markdown.match(/^### \d+\./gm) || []).length, 20);
  for (let id = 1; id <= 20; id += 1) {
    const expected = item(id);
    assert.ok(markdown.includes(`### ${expected.rank}. ${expected.titleZh}`));
    assert.ok(markdown.includes(`- **原始标题**：${expected.platform} 原题 \\[${expected.rank}\\] \\*保持不变\\*`));
    assert.ok(markdown.includes(`(${expected.url})`));
  }
  assert.match(markdown, /本次摘要生成失败，原始榜单条目按快照保留。/);
});

test("forum Top 10 contract rejects a missing or reordered raw rank", () => {
  assert.throws(() => parseForumTop10Payload(source(Array.from({ length: 19 }, (_, index) => item(index + 1)))), /expected 20/);
  const reordered = Array.from({ length: 20 }, (_, index) => item(index + 1));
  [reordered[0], reordered[1]] = [reordered[1], reordered[0]];
  assert.throws(() => parseForumTop10Payload(source(reordered)), /order changed/);
});

test("forum item summaries cannot be attached to a different ranked item", () => {
  const summary = "这是一段只依据帖子正文和评论写成的中文摘要，包含足够的具体信息、讨论焦点与分歧，也不会改写原始标题或榜单事实。".repeat(2);
  assert.deepEqual(parseForumItemSummary(JSON.stringify({ item_id: 4, title_zh: "准确的中文标题", summary }), 4), {
    titleZh: "准确的中文标题",
    summary,
  });
  assert.throws(() => parseForumItemSummary(JSON.stringify({ item_id: 5, title_zh: "准确的中文标题", summary }), 4), /ID mismatch/);
  assert.throws(() => parseForumItemSummary(JSON.stringify({ item_id: 4, title_zh: "English only", summary }), 4), /needs a Chinese title/);
});
