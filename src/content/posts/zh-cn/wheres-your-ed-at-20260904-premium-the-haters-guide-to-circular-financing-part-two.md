---
author: bhwa233
pubDatetime: 2026-09-04T16:24:26.000Z
modDatetime: 2026-09-05T04:37:02.921Z
title: "会员专享：唱衰者眼中的循环融资指南（第二部分）"
featured: false
draft: false
tags:
  - 阅读
  - "Where's Your Ed At"
description: "会员专享"
timezone: Asia/Shanghai
source:
  title: "Premium: The Hater's Guide To Circular Financing (Part Two)"
  author: "Ed Zitron"
  publication: "Where's Your Ed At"
  url: "https://www.wheresyoured.at/premium-the-haters-guide-to-circular-financing-part-two"
  publishedAt: 2026-09-04T16:24:26.000Z
translation:
  language: zh-CN
  model: "gemini-3.7-flash"
  promptVersion: substack-translation-v3
  translatedAt: 2026-09-05T04:37:02.921Z
  authorized: false
---

> 原文：[Premium: The Hater's Guide To Circular Financing (Part Two)](https://www.wheresyoured.at/premium-the-haters-guide-to-circular-financing-part-two)
> 原作者：Ed Zitron · Where's Your Ed At · 2026-09-04
> 中文翻译；版权归原作者所有。

你知道，有时向人们解释循环融资中“循环”的部分其实挺难的，因为有些协议安排显得非常 _笨拙_ 。英伟达（NVIDIA）投资 OpenAI，OpenAI 再用这笔钱向微软（Microsoft）、谷歌（Google）、亚马逊（Amazon）或 CoreWeave 租回英伟达的 GPU，然后 _这笔_ 钱又被用来……从制造服务器的台湾 ODM（原始设计制造商）那里采购服务器，而这些 ODM 又从英伟达购买 GPU 安装到服务器中。

之所以说它笨拙，是因为人们[即便并非事实](https://www.wheresyoured.at/the-ai-demand-bubble/#analysts-estimate-that-more-than-70-of-amazon-microsoft-and-google%E2%80%99s-ai-revenues-come-from-openai-and-anthropic)，也会声称还有某个规模难以确定的“其他”庞大客户群体也在购买算力或英伟达的 GPU。因此，我们应该[对眼前显而易见的现实视而不见](https://www.wheresyoured.at/hyperscale-normalization/)，甚至还要 _庆祝_ 这套机制运转得多么 _良好_ 。尽管存在一个“融资”“闭环”，但这 _完全不是问题_ ，因为 _在这堆乱七八糟的资金流向中总归有那么几块钱是真金白银，而且既然我们无法精确衡量，那就没什么好担心的！_

别担心，亲爱的读者，因为我们终于迎来了一个可以深入剖析的、 _纯粹且毫无修饰的_ 循环融资操作——[软银（SoftBank）旗下子公司 SB Energy 刚刚提交了 S-1 招股书](https://www.sec.gov/Archives/edgar/data/2133037/000162828026059639/sbenergy-sx1.htm?ref=wheresyoured.at#ibd328914164744a59d5efbea2b7d64fb_31)，其循环程度之高，让我着实惊讶于他们竟然还真打算上市。

### 什么是 SB Energy？

这是个好问题，而且答案并不像你想象的那么显而易见。

简而言之，SB Energy 是（或者曾经是）一家可再生能源企业，[严格来说成立于 2019 年](https://sbenergy.com/who-we-are/?ref=wheresyoured.at)，但在 [2023 年 4 月将大部分股份（以及大部分风电和太阳能资产）出售给了丰田（Toyota）](https://group.softbank/en/news/press/20230428?ref=wheresyoured.at)，随后更名为“Terras Energy”，软银仅保留了 15% 的剩余股份。虽然尚不清楚当时究竟留下了什么资产，但[一家名为 SB Energy 的公司于 2023 年 11 月从一个银行财团那里筹集了 24 亿美元](https://sbenergy.com/renewable-energy-project-financing/?ref=wheresyoured.at)，随后在 2024 年以在得克萨斯州迈拉姆县（Milam County）为[谷歌](https://sbenergy.com/project/orion-i-orion-ii-and-orion-iii/?ref=wheresyoured.at)提供服务的[数据中心电力公司](https://www.prnewswire.com/news-releases/sb-energy-announces-commercial-operation-of-american-made-solar-projects-to-help-power-google-data-centers-302280706.html?ref=wheresyoured.at)（名为 Orion）身份重新亮相，并[从软银和资产管理公司 Ares 处筹集了 5 亿美元](https://www.bloomberg.com/news/articles/2024-05-30/softbank-ares-backed-sb-energy-seeks-at-least-500-million?ref=wheresyoured.at)；到了 2025 年初，在那个子虚乌有的星际之门（Stargate）数据中心项目的初步公告中，该公司被提及[与得州迈拉姆县一个面向 OpenAI 的数据中心相关联](https://openai.com/index/five-new-stargate-sites/?ref=wheresyoured.at)，这表明与谷歌的交易已经结束，由 OpenAI 接盘。

SB Energy 一直相对低调，直到 2026 年 1 月，[OpenAI 和软银各向其投资了 5 亿美元](https://sbenergy.com/openai-and-softbank-group-partner-with-sb-energy/?ref=wheresyoured.at)。几个月后的 3 月，[一个美日企业联合体宣布计划在俄亥俄州派克顿（Piketon）的能源部场地兴建一座数据中心](https://group.softbank/en/news/press/20260321?ref=wheresyoured.at)。2026 年 8 月，[SB Energy 和 OpenAI 宣布了一项协议](https://www.wsj.com/articles/openai-locks-in-lease-for-huge-data-center-in-ohio-with-backing-from-nvidia-7474bb9c?mod=hp_lead_pos4&ref=wheresyoured.at)，OpenAI 将在未来的某个时间点租用 10 吉瓦（GW）的容量，且[英伟达为该交易提供 1050 亿美元的担保兜底](https://www.cnbc.com/2026/08/17/nvidia-financing-open-ai-data-center-ohio.html?ref=wheresyoured.at)；但事实证明，其实际条款是： _如果项目建成_ ，且 _在没有其他人愿意承租、同时变卖资产所得不足 1050 亿美元的情况下，英伟达将补足差额_ 。这里的关键词是 _如果项目建成_ ——因为如果建不成，英伟达 _连一分钱都不用掏_ 。

[英伟达还同意投资 30 亿美元](https://www.wsj.com/finance/investing/sb-energy-files-for-ipo-with-nvidia-backing-b17bd1fc?ref=wheresyoured.at)，其中 15 亿美元为预付款项，据《华尔街日报》报道，另外 15 亿美元为“预付费远期合约”，这意味着英伟达将在本次发行完成时获得相应股份。据《华尔街日报》报道，SB Energy 还向 OpenAI 提供了 400 万份认股权证，以及只要持股达到 5% 即可指定董事会席位的权利，估值约为 55 亿美元。

SB Energy 在 2026 年上半年营收约为 1.38 亿美元，主要来自售电业务。而其数据中心部门的营收仅为微不足道的 65.3 万美元。

不过别担心，SB Energy 还有大量在建容量……

![](/images/substack/wheres-your-ed-at/256eadfeb224898a7ae5.png)

……只不过其中 99.4% 的容量都是专门为 OpenAI 预留的，而且根据“RFS”（投运就绪）日期来看，似乎没有任何一部分能在 2028 年之前上线。事实上，SB Energy 几乎全部的营收都取决于两点：A）完成这些数据中心的建设；B）OpenAI 有能力支付这笔费用。

好吧，我们先别太悲观。也许 SB Energy 在别处还有其他数据中心容量？不，不可能，有的话上面会列出来。也许它能……在其他地方……挣到钱？以某种方式？我听说它手握 4390 亿美元的储备订单，总会在某个时候赚到这些钱的，对吧？

![](/images/substack/wheres-your-ed-at/fde1c5872a587d974f27.png)

我的 _天哪！_

我知道这是一大堆数字和文字，但在那 4390 亿美元中，SB Energy 预计在 _未来两年内_ 仅能实现 10 亿美元，在 _未来四年内_ 实现 120 亿美元，在 _未来六年内_ 实现 300 亿美元，在 _未来八年内_ 实现 390 亿美元，而剩余的 _3570 亿美元将在 **此后的某个时间点** 才能实现_ 。SB Energy 储备订单营收的 97% 都要在四年以后才会到来，并且前提是 SB Energy 有能力投入 1780 亿美元的资本支出。

OpenAI 的租约被分散在 17 个不同的特殊目的机构（SPV）中，我推测所有这些机构未来都会尝试举债融资。

总结一下：软银投资组合中的 SB Energy，与同属软银投资组合的 OpenAI 签署了价值 4390 亿美元的业务协议；OpenAI 同时也是 SB Energy 的投资人及其最大（且唯一真正的）客户。SB Energy 赚取其中 _任何_ 款项的前提，都在于能否完成 _两个极其宏大且迥然不同的基础设施项目_ ——一个位于得州迈拉姆县的 1 吉瓦数据中心，以及一个位于俄亥俄州的 10 吉瓦扩建工程，而后者即便在 _实际建成的前提下_ ，也仅获得了英伟达 _一半_ 的兜底担保。

坦白讲： **这场 IPO 完全是靠循环融资促成的，其估值的绝大部分都来自于纯理论上的交易——交易对手方根本无力支付费用，而它自己也根本无力承担建设相应数据中心的成本。**

这几乎是你能见到的最赤裸裸的“皇帝的新衣”戏码。SB Energy 未来 99.4% 的营收都取决于数据中心容量的建设，而这项建设需要耗费 _数年时间_ ，动用尚未筹集到的资金，且全部服务于一个必须将现有收入提升十倍以上才能付得起账的客户。

任何报道这场 IPO 的人都应该直接告知投资者：在很大程度上，他们投资的不过是一家迄今为止从未实际建成过 AI 数据中心的公司所拥有的几纸签名和几片地皮。

然而相反的是，大多数人只是乏味地随声附和，称 SB Energy“与 OpenAI 签有一笔巨额合同”，并且“拥有数千亿美元的储备订单”。

上周的会员专享文章重点探讨了英伟达，今天我将深入剖析 AI 泡沫中其他涉嫌循环交易的对象，并回顾循环融资本身的历史，以此解释这一切究竟有多么 _脆弱_ 与 _危险_ 。
