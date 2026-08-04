import { dailyDigestMarkdownFromModelJson } from "../../scripts/daily_digest_compose.ts";
import { economistWeeklyMarkdown } from "../../scripts/economist_weekly_compose.ts";
import { githubTrendingMarkdownFromModelJson } from "../../scripts/github_trending_compose.ts";
import { mdblistMarkdownFromModelJson } from "../../scripts/mdblist_compose.ts";
import { fixture } from "./mocks.ts";

/**
 * Runs a task's checked-in model output + source fixture through its composer, producing the
 * intermediate archive-contract Markdown. Shared by the compose and archive test suites.
 */
export function composeFixtureBody(task: string): string {
  const source = fixture("blog-sources", `${task}.md`);
  const raw = fixture("blog-ai-responses", `${task}.json`);
  if (task === "github-trending-daily") return githubTrendingMarkdownFromModelJson(raw, source);
  if (task === "mdblist-weekly") return mdblistMarkdownFromModelJson(raw, source);
  if (task === "economist-weekly") return economistWeeklyMarkdown(source).markdown;
  return dailyDigestMarkdownFromModelJson(raw, source);
}
