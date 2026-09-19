---
author: bhwa233
pubDatetime: 2026-09-18T15:45:13.000Z
modDatetime: 2026-09-19T04:44:09.859Z
title: "唱衰者的AI债务指南（上篇）"
featured: false
draft: false
tags:
  - 阅读
  - "Where's Your Ed At"
description: "作者评估AI基建债务泡沫与资金危机"
timezone: Asia/Shanghai
source:
  title: "Premium: The Hater's Guide To AI Debt (Part 1)"
  author: "Ed Zitron"
  publication: "Where's Your Ed At"
  url: "https://www.wheresyoured.at/premium-the-haters-guide-to-ai-debt-part-1"
  publishedAt: 2026-09-18T15:45:13.000Z
translation:
  language: zh-CN
  model: "gemini-3.7-flash"
  promptVersion: substack-translation-v3
  translatedAt: 2026-09-19T04:44:09.859Z
  authorized: false
---

> 原文：[Premium: The Hater's Guide To AI Debt (Part 1)](https://www.wheresyoured.at/premium-the-haters-guide-to-ai-debt-part-1)
> 原作者：Ed Zitron · Where's Your Ed At · 2026-09-18
> 中文翻译；版权归原作者所有。

时间是2026年，你是一家超大规模云服务商（hyperscaler）的CEO。你拉上巴塔哥尼亚（Patagonia）背心的拉链，在ChatGPT里输入“UPDATE ME ON CALENDOR TOODAY”（查看今天日程），发现自己跟首席财务官（CFO）有个会。对方告诉你，虽然他们 **非常喜欢** 你为那些 **绝对能建起来** 的数据中心买的这大批GPU，并且 **完全赞成你买得更多** ，但以目前的烧钱节奏，公司实际上已经负担不起了。

“但我们可是全世界创造现金流最多的几家公司之一啊！”你愤怒咆哮，以至于你那只缺乏管教的柴犬开始啃咬你的赫曼米勒Aeron椅。“我们搞AI都搞了多少年了！钱到底去哪儿了？”

CFO皱起了眉头。“嗯，问题就在这里。[我们实际上并没有靠它赚到多少现金](https://www.wheresyoured.at/news-microsoft-disclosures-suggest-openai-sales-account-for-around-70-of-fy26-ai-revenue-more-than-7-of-fy26-revenue/)，反而看起来在亏钱。我们到底为什么还要买更多GPU？[之前买的那些大部分都还没安装呢](https://www.theguardian.com/technology/2026/aug/17/are-microsofts-ai-plans-being-held-back-by-a-shortage-of-chips?ref=wheresyoured.at)——”

你开始止不住地发抖。“为。了。搞。人。工。智。能。你。到。底。有。什。么。不。明。白。的。现。在。就。去。买。更。多。GPU。”柴犬此刻正在撕扯你的伊姆斯椅（Eames chair），但你气得根本顾不上了。

你的CFO庆幸彼此之间还隔着一个微软Teams窗口，试图让你平静下来，于是让ChatGPT生成了一段安抚你的台词。“我知道你不喜欢我刚才说的话——这是我的问题。我这里有个绝妙的解决方案，应该能解决问题——我们的信用评级非常好，可以通过各种方式融资。这不仅是一个解决方案，更是一项战略。”

你停止了颤抖。你那个愚蠢的首席财务官竟然出了个好主意。你让ChatGPT凭感觉写个方案看板的代码，结果把你的Chrome浏览器搞崩溃了。“我刚算了一下数据。你说得对。”当CFO从背景里看到你的柴犬正在就地小便时，露出了微笑。

虽然我这里用了点艺术夸张，但这正是当今全球最大科技公司的真实写照：[甲骨文（Oracle）](https://www.axios.com/2026/09/11/oracle-ai-sales-cash?ref=wheresyoured.at)、[谷歌（Google）](https://arstechnica.com/google/2026/07/google-just-had-its-first-negative-cash-flow-quarter-ever-due-to-massive-ai-spending/?ref=wheresyoured.at)和[亚马逊（Amazon）](https://www.geekwire.com/2026/aws-is-booming-but-amazons-free-cash-flow-turns-negative-on-record-ai-spending/?ref=wheresyoured.at)的自由现金流均已转为负值（[Meta也紧随其后](https://www.cnbc.com/2026/07/29/meta-q2-earnings-report-2026.html?ref=wheresyoured.at)），而这一切都是为了追逐一个规模难以估量的机遇——向[Anthropic和OpenAI](https://www.wheresyoured.at/the-ai-demand-bubble/)，或者以谷歌为例向[Meta](https://www.wheresyoured.at/the-ai-demand-bubble/#:~:text=OpenAI%E2%80%99s%20ongoing%20work.-,Google,-is%20in%20a)，销售AI软件或出租AI芯片（这些芯片购自英伟达或博通，详情请参阅我的[唱衰](https://www.wheresyoured.at/premium-the-haters-guide-to-nvidia-part-2/)[指南](https://www.wheresyoured.at/premium-the-haters-guide-to-broadcom/)系列）。

重申一下我一段时间以来一直在讲的观点，大型科技公司在AI建设上面临着几个问题：

- AI芯片极其昂贵。
- AI数据中心的建设和通电需要耗费大量时间。
- AI服务的运行成本高昂。
- AI服务似乎并没有带来多少收入。

超大规模云服务商传统上的运营相对精简，运营支出并不一定会随着收入成比例增加，加上资本支出（即对业务的长期投资）较低，这意味着即便[甲骨文的收入基本持平](https://www.wheresyoured.at/premium-the-haters-guide-to-oracle-part-2/#:~:text=actually%20boosted%20revenues.-,Adjusted,-for%20inflation%2C%20Oracle%E2%80%99s)，也丝毫不妨碍它每个季度都在疯狂印钞。

然而，AI数据中心的惊人成本彻底改变了一切。

资本支出在经营现金流（即公司每季度流入并支出的全部资金）中所占的比例正急剧上升。除去[亚马逊在2021年和2022年对其物流网络的大规模扩张](https://adainsights.com/blog/did-amazon-over-invest-in-logistics?ref=wheresyoured.at)以及[Meta在元宇宙上的可怕投资](https://finance.yahoo.com/news/mark-zuckerberg-threw-77-billion-143014208.html?ref=wheresyoured.at)之外，该图表此前一直相对平缓，直到AI泡沫开始蚕食每一分可用的现金流。

他们的辩解是自己正在“建设未来的基础设施”，但这一点似乎既 A）没有转化为收入，也 B）没有缓解现金流的紧张局面。尽管谷歌、甲骨文、微软和亚马逊[仅从Anthropic和OpenAI获得的未交付订单金额就增加了超过一万亿美元](https://www.theinformation.com/articles/anthropic-commits-spending-200-billion-googles-cloud-chips?rc=kz8jh3&ref=wheresyoured.at)，但他们入账的 **真金白银** 似乎对填补资金消耗毫无帮助。

这里有一张图表可以说明这个问题。一个简单的理解方式是，这是流入公司的资金被资本支出吞噬的百分比——正如你所看到的，这几乎相当于大型科技公司赚到的每一分钱。

![](/images/substack/wheres-your-ed-at/9f3bb33d8058df326f0f.png)

与此同时，随着AI泡沫不断膨胀，一种新型公司应运而生——“新型云提供商”（neocloud），[这类公司通过融资来购买AI芯片](https://www.wheresyoured.at/the-enshittifinancial-crisis/#the-devil%E2%80%99s-deal-of-investing-in-ai-startups:~:text=since%20March.-,CoreWeave%20Is%20Still%20A%20Time%20Bomb%20By%20The%20Way,-CoreWeave%20is%20something)并建设数据中心。这些公司通常要么是凭借黄仁勋的暗黑魔法凭空捏造出来的新实体，要么是加密货币矿企（它们已经具备电力接入能力，尽管通常还不够）将其比特币/以太坊业务转型为AI数据中心。

在某些情况下，新型云提供商会从Core Scientific和Applied Digital等托管服务商处租用算力容量，而这些托管公司反过来通过举债来建造数据中心并获取电力，新型云提供商只需购买内部安装的所有IT设备即可。

与超大规模云服务商类似，新型云提供商也承诺建设吉瓦级（gigawatt）的数据中心容量，这意味着它们不得不承担巨额债务。尽管它们的资本支出可以与全球最大的企业相匹敌，但它们的收入与流出的现金相比不过是九牛一毛，而且情况每个季度都在恶化：

![](/images/substack/wheres-your-ed-at/82667162b0797ff27c31.png)

正如我之前所言，尽管人人都想把AI泡沫描绘得极其 **复杂** ，但它其实 **极其简单** ：数千亿美元被砸了进去，只为换来有朝一日可能实现的个位数数十亿美元收入——前提是AI数据中心真的能大规模建成，且OpenAI和Anthropic能够付得起算力费用。

建设AI数据中心的不可思议之高昂成本，导致每个涉足其中的人似乎都只能亏钱，以至于全世界最富有的公司都陷入了赤字，而AI算力专业公司每季度都在失血数十亿美元，只为了碰碰运气看能否在 **2030年** 之前回本。

不过别担心。[私募信贷（private credit）](https://www.wheresyoured.at/hatersguide-privatecredit/)、投资银行和全球债券市场的合力，仅在2026年就为[超过5000亿美元的AI相关债务发行](https://www.goldmansachs.com/insights/goldman-sachs-exchanges/how-ai-debt-is-reshaping-the-credit-market?ref=wheresyoured.at)提供了资金支持。这涵盖了普通债券、复杂的特殊目的实体（SPV）、可转换票据（即可以转换为股票的贷款）、延迟提款定期贷款以及直接贷款等多种形式。令人担忧的是，绝大多数交易背后反复出现的都是同一批面孔——例如贝莱德（BlackRock）和黑石（Blackstone）等资产管理机构，以及日本的三菱日联金融集团（MUFG）和三井住友银行（SMBC）。

然而，问题不仅在于它 **极其昂贵** ，还在于 **我提到的每一个参与方都已明确表示他们将需要越来越多的资金** 。[高盛估计，仅超大规模云服务商在2027年就将发行4000亿美元的债券](https://finance.yahoo.com/markets/article/big-tech-will-fund-more-than-a-third-of-its-ai-investments-with-debt-in-2027-goldman-sachs-predicts-145136150.html?ref=wheresyoured.at)，而分析师的普遍共识估计CoreWeave、Nebius和IREN的总支出将达到970亿美元，其中绝大部分将完全通过举债来解决。

好吧，其实问题远不止这些。

每一个超大规模云服务商、数据中心SPV和新型云提供商都将在这个彻底混乱且物价持续攀升的时代进行融资：利率对 **所有人** 来说都在飙升，而由于DRAM内存成本飞涨，[英伟达刚刚将其价格上调了15%](https://finance.yahoo.com/technology/ai/articles/nvidia-raising-ai-server-prices-131547349.html?ref=wheresyoured.at)，这不仅推高了GPU的成本，也推高了数据中心内部几乎所有能想到的组件成本。

今天的通讯是对支撑AI泡沫的债务世界进行全面而残酷剖析的第一部分，深入探讨这些债务是如何运作的、是如何募集的、是由谁资助的，以及为什么各项成本的 **全面** 上涨可能导致AI建设难以维系。我准备了你所需的图表、数据和解析，助你理解局势即将变得多么诡异和昂贵。

这就是《唱衰者的AI债务指南》，或者叫《KobayAIshi丸测试》（ _The KobayAIshi Maru_ ）。
