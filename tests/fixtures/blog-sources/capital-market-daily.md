## 市场速览（2099-01-02）

| 分类 | 品种 | 最新 | 当日 | 今年以来 |
| :-- | :-- | --: | --: | --: |
| 美股 | 标普500 | 7000.00 | +1.30% | +8.00% |
| 美股 | 纳斯达克 | 23100.00 | +1.80% | +11.20% |
| 美股 | 道琼斯 | 46200.00 | +0.40% | +4.10% |
| A股 | 上证指数 | 3480.00 | -0.60% | +2.30% |
| A股 | 创业板指数 | 2210.00 | -1.40% | -3.80% |
| 港股 | 恒生指数 | 24800.00 | -0.20% | +6.50% |
| 港股 | 恒生科技指数 | 5600.00 | +0.90% | +9.70% |
| 加密 | 比特币 | 108500.00 | +1.41% | +14.60% |

<!-- ===SECTION=== -->

## 结构化市场证据

```json
{
  "schema_version": 1,
  "date": "2099-01-02",
  "market_overview": {
    "rows": [
      {
        "name": "标普500",
        "latest": 7000,
        "daily_change": "+1.30%"
      },
      {
        "name": "上证指数",
        "latest": 3480,
        "daily_change": "-0.60%"
      },
      {
        "name": "恒生指数",
        "latest": 24800,
        "daily_change": "-0.20%"
      },
      {
        "name": "比特币",
        "latest": 108500,
        "daily_change": "+1.41%"
      }
    ]
  },
  "markets": {
    "us": {
      "status": "open",
      "direction": "up",
      "strongest_index": "纳斯达克",
      "weakest_index": "道琼斯"
    },
    "ashare": {
      "status": "open",
      "direction": "down",
      "strongest_index": "上证指数",
      "weakest_index": "创业板指数"
    },
    "hk": {
      "status": "open",
      "direction": "mixed",
      "strongest_index": "恒生科技指数",
      "weakest_index": "恒生指数"
    },
    "crypto": {
      "status": "open",
      "direction": "up",
      "spot": {
        "change_24h_pct": 1.41
      }
    }
  }
}
```
