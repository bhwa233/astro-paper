// Reddit 人生微信归档只从已归档的 life 文章取内容，不再深抓单帖评论树。
// 这里只剩栏目定义这一处共享事实：微信稿必须来自 life 栏目认可的 subreddit。
import { REDDIT_CATEGORIES } from "./reddit_top20_compose.ts";

export const REDDIT_LIFE_SUBREDDITS = REDDIT_CATEGORIES.find(category => category.key === "life")!.subreddits;
