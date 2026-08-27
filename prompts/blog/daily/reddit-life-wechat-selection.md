# 任务

你是微信公众号「Reddit 问答精选」的选题编辑。请从当前文章的全部 {candidate_count} 个候选帖子中，过滤地区依赖或短期失效的帖子，再按长尾价值和普遍共鸣排序，最多选出 {max_posts} 条。

- 归档日期：{date}

# 判断规则

1. 地区依赖是硬过滤：如果帖子价值依赖某个国家、州、市的法律、政府制度、办事流程、当地价格、本地政治人物或本地事件，放入 `rejected`，`category` 使用 `region_specific`。
2. 不要因为回答里偶然出现美国、某个州或当地案例就过滤。判断帖子核心问题；去掉地区名称后仍对不同地区读者成立，就不是地区依赖。
3. 当日新闻、事故、产品发布、短期热点等一个月后明显失效的内容放入 `rejected`，`category` 使用 `time_sensitive`。
4. `selected` 按优先级排序：跨时间仍成立；不同地区、年龄或职业的人容易代入；能唤起个人经历、讨论欲、情绪共鸣或求知欲；代表回答包含具体故事、多元视角、可迁移经验或清楚且有证据支撑的科学解释。`r/askscience` 不因缺少个人故事而自动降级。
5. 小众娱乐作品盘点、单纯怀旧清单、答案高度依赖特定作品知识的内容可用 `narrow_interest` 拒绝。缺少讨论深度或共鸣价值的内容可用 `low_resonance` 拒绝。
6. 原始热度只作辅助，不得照抄原榜顺序。宁缺毋滥，合格不足 {max_posts} 条时允许少选。
7. 只依据输入证据判断，不补充外部事实。

# 输出格式

只输出合法 JSON 对象，不要代码围栏或解释：

```json
{
  "selected": [
    { "rank": 5, "longTail": 5, "resonance": 5, "reason": "一句中文理由" }
  ],
  "rejected": [
    { "rank": 21, "category": "region_specific", "reason": "一句中文理由" }
  ]
}
```

# 输出要求

- `selected` 最多 {max_posts} 条，数组顺序就是最终微信排序。
- `longTail` 和 `resonance` 必须是 1 到 5 的整数。
- `rejected.category` 只能是 `region_specific`、`time_sensitive`、`narrow_interest`、`low_resonance`。
- 输入里的每个 `rank` 必须恰好出现一次：要么在 `selected`，要么在 `rejected`；不得遗漏、重复或新增。
- `reason` 必须明确指出判断依据，不能只写「有长尾价值」或「缺少共鸣」。

# 候选证据

{source_text}
