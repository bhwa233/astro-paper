// Pagefind 的中文检索由三步配合完成，三步必须共用同一套汉字范围，所以放在一个文件里：
// 索引侧把正文汉字拆成单字（`spaceOutHan`），查询侧同样拆开并尽量加引号做短语
// （`toPagefindQuery`），展示侧再把标题与摘要里的字间空格拼回去（`collapseHanSpacing`）。
//
// 为什么要拆字：pagefind 索引侧用 charabia（jieba）分词，查询侧用 `Intl.Segmenter`，
// 两边的词边界并不一致。pagefind 是 AND 语义，查询里只要有一个词在页面上不是独立词条，
// 整页就出局——中文长句因此会整条落空。改成按字建索引后不再依赖任何词典：
// 整串汉字加引号即等价于子串匹配。
//
// 服务出去的 HTML 不受影响，拆字只作用于喂给 pagefind 的临时副本，见 scripts/pagefind_index.ts。

// 只处理汉字：假名、谚文、拉丁字母本来就有词边界或空格，拆开只会变差。
const HAN = "\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff";

const hanRun = () => new RegExp(`[${HAN}]+`, "g");
const allHan = new RegExp(`^[${HAN}]+$`);
const hanBeforeHan = new RegExp(`([${HAN}])\\s+(?=[${HAN}])`, "g");
const hanBeforeMark = new RegExp(`([${HAN}])\\s+(?=</?mark>)`, "g");
const markBeforeHan = new RegExp(`(</?mark>)\\s+(?=[${HAN}])`, "g");

const splitChars = (run: string): string => [...run].join(" ");

/** 索引侧：把每段汉字拆成空格分隔的单字，让 pagefind 按字而不是按词建索引。 */
export function spaceOutHan(text: string): string {
  return text.replace(hanRun(), splitChars);
}

/**
 * 查询侧：整串汉字加引号走短语匹配，等价于子串搜索，命中唯一且精确。
 * 混合查询只能逐字拆开走 AND——pagefind 不支持多个引号短语相与，
 * `"微 信" "推 送"` 会返回 0 条，`Claude "保 持 清 醒"` 则会让短语约束失效。
 */
export function toPagefindQuery(term: string): string {
  const trimmed = term.trim();
  if (!trimmed) return term;
  if (allHan.test(trimmed)) return `"${splitChars(trimmed)}"`;
  return trimmed.replace(hanRun(), splitChars);
}

/**
 * 展示侧：去掉索引带进来的字间空格。摘要里的高亮标签会夹在字中间
 * （`<mark>拼 </mark><mark>尽 </mark>`），所以要跨 `<mark>` 一起收。
 */
export function collapseHanSpacing(text: string): string {
  return text
    .replace(hanBeforeHan, "$1")
    .replace(hanBeforeMark, "$1")
    .replace(markBeforeHan, "$1");
}
