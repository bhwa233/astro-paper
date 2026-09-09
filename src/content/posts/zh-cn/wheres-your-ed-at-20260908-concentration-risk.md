---
author: bhwa233
pubDatetime: 2026-09-08T14:28:03.000Z
modDatetime: 2026-09-09T04:51:16.871Z
title: "集中度风险：AI 泡沫中的次贷危机隐影"
featured: false
draft: false
tags:
  - 阅读
  - "Where's Your Ed At"
description: "集中度风险：AI 泡沫中的次贷危机隐影"
timezone: Asia/Shanghai
source:
  title: "Concentration Risk"
  author: "Ed Zitron"
  publication: "Where's Your Ed At"
  url: "https://www.wheresyoured.at/concentration-risk"
  publishedAt: 2026-09-08T14:28:03.000Z
translation:
  language: zh-CN
  model: "gemini-3.7-flash"
  promptVersion: substack-translation-v3
  translatedAt: 2026-09-09T04:51:16.871Z
  authorized: false
---

> 原文：[Concentration Risk](https://www.wheresyoured.at/concentration-risk)
> 原作者：Ed Zitron · Where's Your Ed At · 2026-09-08
> 中文翻译；版权归原作者所有。

作为股市上市值最高的公司，英伟达（NVIDIA）首席执行官黄仁勋（Jensen Huang）宣称 “ [AGI 已经到来](https://x.com/JensenHuang/status/2096700264569090384?s=20&ref=wheresyoured.at) ”，这是对 [Crusoe 首席执行官祝贺 OpenAI 推出其 GPT-6 Astra 模型](https://x.com/ChaseLochmiller/status/2096445087505055891?s=20&ref=wheresyoured.at) 的回应，后者称这 “让阿比林（Abilene）成为了 AGI 的诞生地”。

据直接了解 Stargate Abilene 当前进展的消息人士透露，在阿比林园区中，最多只有八栋建筑中的四栋能够正常运转。该园区是 Crusoe 为甲骨文（Oracle）建造的 AI 数据中心，旨在出租给 OpenAI，并且 [于 2024 年的某个时候动工](https://www.datacenterdynamics.com/en/news/crusoe-signs-34bn-joint-venture-with-blue-owl/?ref=wheresyoured.at) 。除了宣称我们已经实现了 AGI，以及接下来将有 “40 万张 GPU 上线” 之外，黄仁勋根本没有对 “AGI” 下过任何定义。我猜他指的是地球上的其他地方，因为 [阿比林总共只有容纳 40 万张 Blackwell GPU 的空间](https://www.crusoe.ai/resources/newsroom/crusoe-blue-owl-capital-and-primary-digital-infrastructure-enter-joint-venture?ref=wheresyoured.at) ，而且正如我所指出的，其中充其量只有一半是实际安装并投入运行的。

每个人都在谈论 AGI 的原因在于，毫无新闻准则和羞耻感的 [《时代》杂志（TIME）](https://time.com/article/2026/08/26/openai-sam-altman-interview/?ref=wheresyoured.at#:~:text=Mark%20Chen%20estimated-,OpenAI,-is%20%E2%80%9C80%25%20of) 引用了 OpenAI 首席研究官马克·陈（Mark Chen）的话，称 OpenAI 距离 AGI 已经 “完成了 80%”，而就在几天后，[首席运营官格雷格·布罗克曼（Greg Brockman）又表示](https://www.businessinsider.com/astra-model-launch-agi-milestone-openai-greg-brockman-2026-9?ref=wheresyoured.at) 我们已经进入了 “ [AGI 时代，无论你认为它是这个模型、上一个模型还是下一个模型](https://x.com/gdb/status/2096721633876771094?s=20&ref=wheresyoured.at) ”。[《华尔街日报》也对此表示赞同](https://www.wsj.com/cio-journal/yes-were-entering-the-era-of-artificial-general-intelligence-d9b0920e?ref=wheresyoured.at) ，尽管它根本无法准确定义 AGI 究竟意味着什么。但这就是 AI 泡沫，那些最应该讲出真相的人大多毫无能力，或者根本不屑于去探究。

这些公司把所有人都当成傻子，这很大程度上是因为包括全球最大媒体在内的所有人，似乎都会轻信几乎任何说辞。英伟达和 Crusoe 实际上什么都没做——我们既没有实现 “AGI”，“AGI 的诞生地” 也没有完工，而且在我读过的所有文章中，除了有人说 “嗯，好吧，AGI 确实没有明确的定义” 之外，似乎没有人提出过这些事实，他们甚至不加思索地迎合着这些公司的说法。

如果说有什么更值得玩味的角度，那就是 _为什么_ 所有这些人突然都从第一性原理出发，为一个本意是 “能够处理超出其原始训练范围任务的人工智能”、如今却演变成各家公司随心所欲定义的词汇集体高潮，以及这一现象如何与 Anthropic 和 OpenAI 争先恐后寻求上市的时间点相吻合。

答案很简单：这些人想阻止你去思考 _真实发生的情况_ ——那就是底层的财务状况和需求根本说不通，而且他们的云软件完全无法证明其令人咋舌的成本是合理的。

今天我想和大家谈谈为什么我认为一场硅谷金融危机正在酝酿，以及其中涉及的集中度风险。

### 让我们来谈谈集中度风险

今天我们要讨论一个你可能听说过、也可能没听说过的词：集中度风险（concentration risk）。

这个词指的是把所有鸡蛋放在一个或几个篮子里，过度依赖少数投资、客户或特定业务线，以至于失去它们就会使你的业务或投资组合遭受巨大打击。在银行业中，[引用美国国家信用社管理局（NCUA）的话](https://ncua.gov/regulation-supervision/letters-credit-unions-other-guidance/concentration-risk?ref=wheresyoured.at) ，它特指任何单一风险敞口或一组风险敞口，其潜在损失足以（相对于资本、总资产或整体风险水平）威胁到金融机构的稳健性或维持其核心运营的能力。

我之所以提出这个，是因为随着 AI 泡沫的破裂，你在未来几个月和几年里会频繁听到这个词或其变体，因为这个行业的几乎每一个环节都伴随着其特定形式的集中度风险。

### OpenAI 和 Anthropic 80% 的企业级收入来自 1% 的客户，而这些客户高度偏向由风险投资补贴的 AI 初创公司

让我们从顶层开始。[根据金融科技公司 Ramp 的数据](https://bsky.app/profile/arakharazian.bsky.social/post/3mukjsrupvs2t?ref=wheresyoured.at) ，OpenAI 和 Anthropic 80% 的企业收入来自其 1% 的客户，这个数字在过去三年里没有任何改善。**Ramp 的首席经济学家阿拉·哈拉齐安（Ara Kharazian）指出，前 1% 的客户高度偏向科技行业以及 AI 产品和服务**，这种集中度风险在他们追踪的任何其他软件类别中都是前所未见的。

而且，随着时间的推移，情况并没有好转。

![](/images/substack/wheres-your-ed-at/74aa3f2a130df91f6883.png)

该数据集很可能包含像 Visa 和 Cursor 这样的大公司，以及大量初创公司和普通规模的公司，它反映了 AI 行业的整体支出情况，但需要注意的是，它不包括微软等巨头或大型银行，并且客户可以选择不被纳入研究。

我还想澄清一点，当 Ramp 提到 “AI 产品和服务” 时，其中包括那些销售带有代币（token）支出补贴订阅的 AI 初创公司，这意味着用户消耗的代币价值可能远超其订阅价格。这意味著 Anthropic 或 OpenAI 从这 1% 的 AI 初创公司身上赚到的钱，完全取决于这些初创公司持续获得风险投资的能力。

这意味着绝大多数企业客户——软件行业真正赚钱的地方——在 AI 上的花费根本没有那么多。那些在 AI 上花费最多的人，高度集中在以下几类：要么是由于风投资助而在内部消耗大量代币的 AI 公司，要么是靠风投资助允许其用户以不可持续的规模挥霍代币的 AI 公司，要么是当前在沉重的同行压力下被迫在 AI 代币上砸钱的科技公司，我想大概还有少数大客户。

### 集中度风险 1：AI 初创公司就是 AI 领域的 NINJA 借款人

在大金融危机期间，数百万人背负了他们毫无希望偿还的债务，其中最恶劣的例子之一就是 “ [NINJA](https://www.investopedia.com/terms/n/ninja-loan.asp?ref=wheresyoured.at) ” 贷款——即 **N**o **I**ncome **N**o **J**ob **A**pplicants（无收入、无工作申请人）或 **N**o **I**ncome **N**o **J**ob **A**ssets（无收入、无工作、无资产，这两种说法我都见过）。

根据 [皮尤研究中心（Pew）](https://www.pew.org/en/research-and-analysis/issue-briefs/2026/08/mortgage-lending-standards-are-too-tight?ref=wheresyoured.at) 的数据，“……在大衰退发生前的几年里，几乎 38% 的新增抵押贷款只需要很少的证明文件，甚至完全不需要。”

具体而言，2005 年 36.5% 和 2006 年 37.9% 的美国购房交易来自几乎没有收入证明的买家，这意味着在很大程度上，这些次级抵押贷款之所以能够成行，完全是因为整个体系 _急于创造更多的贷款需求_ ，而不是 _与能够按期还款的稳定客户达成借贷协议_ 。

> **旁注：** 在我们继续之前，我还希望大家明白，“次级（subprime）” 指的不是 _借款人_ ，而是 _贷款本身_ 。在大金融危机爆发前，许多 “富裕” 的人也获得了他们无力承担的抵押贷款。

2005 年和 2006 年的 “房主” 很可能在任何实际意义上都买不起他们正在购买的房屋。

我真希望没人犯同样的错——[我的天呐](https://www.youtube.com/watch?v=S5-t8WSQafM&ref=wheresyoured.at) ！

### Anthropic 和 OpenAI 的数十亿美元收入依赖于无利可图的、由风投资助的 AI 初创公司所制造的虚假收入

这意味着 OpenAI 和 Anthropic 80% 的企业收入（占其总收入的绝大部分）依赖于可能只有数百家在 AI 代币上过度消费的客户，其中相当大一部分是只要有风险投资支持才能维系下去的 AI 初创公司。

让我来具体拆解一下这意味着什么：

- AI 初创公司在运行服务时，会接入 OpenAI 和 Anthropic 提供的模型，并按每百万代币付费。
- 在我所见过的几乎所有案例中，AI 初创公司都会对其客户的 AI 使用进行 “补贴”，允许他们消耗远超月度订阅费价值的代币，而初创公司则按全价或微弱的折扣价为这些代币买单。
- 这完全是靠无休止的风险投资才成为可能的。
  - 例如，[法律 AI 初创公司 Harvey 已经筹集了超过 10 亿美元](https://www.cnbc.com/2026/03/25/legal-ai-startup-harvey-raises-200-million-at-11-billion-valuation.html?ref=wheresyoured.at) ，并且 [正试图再筹集 5 亿美元](https://www.pymnts.com/news/investment-tracker/2026/harvey-targets-15-5-billion-valuation-as-revenue-surges-past-350-million/?ref=wheresyoured.at) ，而它的 “年化” 收入仅有 3.5 亿美元，这意味着（假设按简单的单月乘以 12 计算）它每月仅赚取约 2900 万美元。像许多 AI 初创公司一样，Harvey 正把数亿美元输送给 Anthropic 和 OpenAI。
- 这意味着这些 AI 初创客户迟早会把输送给 OpenAI 和 Anthropic 的资金耗尽，因为从连接到 AI 模型那一刻起，其服务在经济上就是不可行的。

AI 初创公司是一种人为制造的收入来源。它们并不是用现金流来支付 Anthropic 和 OpenAI，也不是因为它们 “获得了巨大的价值”，事实上，它们能这么做仅仅是因为有人在源源不断地向它们注入巨额现金。尽管它们的收入可能在增长，但与融资金额的绝对数字或融资速度相比就相形见绌了。[Harvey 仅在 2025 年就筹集了超过 8 亿美元](https://tracxn.com/d/companies/harvey/__wv3Ir3KF1kZj1Zll1_0BJ3nIHx8uKPnDrx2Z1k7aQkU/funding-and-investors?ref=wheresyoured.at) ，并在年底达到了约 1.9 亿美元的年化运行率（run rate），相当于每月约 1580 万美元，这意味着如果没有风险投资的支撑，它在一年多前就已经彻底死掉了。

我们必须把话说明白：**OpenAI 和 Anthropic 在财务上完全依赖这些客户来维持生存。** 尽管 “企业级” 理论上可以指一群使用大语言模型进行编码或其他业务的《财富》500 强或大型企业，但根据 Ramp 的数据非常明确的一点是，这些公司最大（即使不是唯一最大）的收入来源之一，就是那些脱离了风投资助就根本付不起代币费用的 AI 初创公司。

由于用户代币消耗享受补贴，AI 初创公司也是最容易被诱导在 AI 上增加支出的群体。当有人打开像 Harvey 或 Perplexity 这样的产品时，他们会期待体验最新的模型，这意味着每家 AI 初创公司实际上都是最新模型的风投营销平台，在推高自身成本的同时将这些资金直接拱手送给 AI 实验室。当用户无需操心 _实际成本_ ，而提供商因为有风投资金支持也无需操心时，每逢新模型发布都能轻易看到收入激增，这给 AI 初创公司提供了吸引用户重返平台的新手段（[例如：Perplexity](https://x.com/perplexity_ai/status/2096006336786133366?ref=wheresyoured.at) ），作为回报也让 AI 实验室的收入水涨船高。

AI 初创公司对 OpenAI 和 Anthropic 构成了巨大的集中度风险，因为这 _不是真实的收入_ 。向 AI 初创公司提供这些服务与其说是在为他们的客户 “赚更多的钱”，不如说是在为他们继续融资提供借口。虽然 Harvey 或 Perplexity 可能 “需要” AI 模型来维持运营，但他们为之买单并不是出于任何 _价值_ 、_商业模式_ 或 _策略_ ，而是因为他们陷入了一场 [红皇后赛跑（Red Queen's Race）](https://en.wikipedia.org/wiki/Red_Queen%27s_race?ref=wheresyoured.at) ——他们必须不惜一切代价提供最新的模型以 “保持领先”。实际上，如果没有融资，这些企业必须 _停止_ 提供 Anthropic 和 OpenAI 的模型才能达到哪怕勉强接近可持续的状态，因为 AI 代币的成本正是导致其亏损的主要原因。

为了让大家对这些客户的规模有个概念：上周 OpenAI 宣布切断对 AI 编程公司 Cursor（现已隶属于 SpaceX）的服务，据 [《连线》（WIRED）报道，Cursor 原本将在 2026 年为 OpenAI 带来超过 10 亿美元的收入](https://www.wired.com/story/openai-elon-musk-cursor-billion-revenue/?ref=wheresyoured.at) ，[占其 2026 年预计 300 亿美元收入的 3% 以上](https://www.theinformation.com/articles/openai-boost-revenue-forecasts-predicts-112-billion-cash-burn-2030?rc=kz8jh3&ref=wheresyoured.at) 。由于 [OpenAI 仅占 Cursor 流量的 5%](https://finance.yahoo.com/technology/ai/articles/openai-cuts-cursor-off-models-223547147.html?ref=wheresyoured.at) ，它今年很可能会向 Anthropic 输送数十亿美元，这是一个巨大的底层风险敞口，如果埃隆·马斯克（Elon Musk）决定不想把所有这些钱送给竞争对手 AI 实验室，这个敞口随时可能蒸发殆尽。

Cursor 之所以能持续向 Anthropic 和 OpenAI 输送资金，只是因为在四个月内筹集了 32 亿美元——[2025 年 6 月](https://techcrunch.com/2025/06/05/cursors-anysphere-nabs-9-9b-valuation-soars-past-500m-arr/?ref=wheresyoured.at) （9 亿美元）和 [2025 年 11 月](https://www.cnbc.com/2025/11/13/cursor-ai-startup-funding-round-valuation.html?ref=wheresyoured.at) （23 亿美元）。[根据 The Information 2025 年 7 月的报道](https://www.theinformation.com/newsletters/dealmaker/anthropic-revenue-pace-nears-5-billion-run-mega-round?rc=kz8jh3&ref=wheresyoured.at) ，Anthropic 的两大客户贡献了 12 亿美元的年化运行率（占当时 40 亿美元运行率的 30%），投资者认为这两个客户就是 Cursor 和微软的 GitHub Copilot，[后者于 2026 年 6 月转为基于代币的计费模式](https://www.wheresyoured.at/news-microsoft-to-shift-github-copilot-users-to-token-based-billing-reduce-rate-limits-2/) 。

问题在于，_Anthropic 和 OpenAI 最大的客户根本负担不起向他们支付的费用_ ，而 _他们又极度需要这些客户每个季度支付更多的钱_ ，这意味着 _每一家 AI 初创公司都需要筹集越来越多的资金才能做到这一点。_

正如我所指出的，他们就是 AI 时代的 NINJA 借款人。他们无需展示可运转的业务或对其产品的可持续需求，只要表现出 _在文件上签字的热情_ 和 _继续挥霍他人金钱的渴望_ 即可。在这种情况下，“房产” 成了初创公司不断攀升的估值本身。将 Perplexity 的估值定在潜在的 300 亿美元（[根据 The Information](https://www.theinformation.com/articles/nvidia-discusses-perplexity-investment-30-billion-plus-valuation-considered-tech-licensing-deal?rc=kz8jh3&ref=wheresyoured.at) ）或给它数十亿美元，没有任何合乎逻辑或理性的依据，纯粹是因为风投家希望看到公司估值上涨，而英伟达希望确保它能继续在 Anthropic 和 OpenAI 身上挥霍数十亿美元。

就像 NINJA 借款人一样，这种恶劣行为在系统层面上得到了默许和纵容，[2025 年全球 50% 的风险投资都流向了 AI 领域](https://news.crunchbase.com/venture/funding-data-third-largest-year-2025/?ref=wheresyoured.at) 。

### 集中度风险 2：科技行业似乎是唯一在 AI 上投入真金白银的行业

如前所述，“前 1%” 偏向于科技和 AI 初创公司，这意味着即使 _抛开_ 不可持续的 AI 公司不谈，Anthropic 和 OpenAI 在收入增长上也主要依赖于一直以来的那些老客户。

这意味着在亏损的 AI 初创公司之外，_在 AI 上花钱的绝大多数 “企业” 都是科技公司，而不是其他行业。_ 科技行业更愿意尝试并把钱投在新的 _玩意儿_ 上，特别是当行业里的其他人已经 _连续几年不停地对其大呼小叫_ 时。这意味着它的 “兴趣” 远远不是由 “这玩意到底有没有用” 或 “我们是否真的需要它” 驱动的。

科技公司拥有更多的软件工程师，进而有更多的软件需要构建或迭代，而且高管层更愿意在软件工具上花钱。

不过我要补充的是，正如 Ramp 的哈拉齐安所指出的，这是 “……在他们追踪的任何其他软件类别中前所未见的集中度风险”，这意味着 _这是 AI 特有的集中度_ ，而不是 _整个软件行业的普遍问题。_

> **旁注：** 看到这里，可能有人会大喊 “_Ramp 的客户群偏向于初创公司_” 以及 “_Ramp 的数据并没有包含所有大企业_”。这些论点都脱离了现实，但即便事实如此，这些依然是极易受到科技高管情绪或风险投资意志左右的庞大收入来源。

换句话说，在科技和 AI 领域之外，极少有公司愿意为 AI 支付大笔资金，这在几乎所有层面上都是灾难性的，而且没有任何明确迹象表明该趋势将如何逆转。

在过去的三年里，AI 充斥于各大媒体，被每个董事会和公司讨论，每家公司都在某种程度上尝试使用 AI，大多数企业都获批在 AI 上砸入一笔 _资金_ ，然而到头来，科技行业似乎唯一能拉拢到在 AI 上砸重金的对象……只有科技行业自己。“科技行业” 还包括数量极其庞大的风投初创公司，它们与 AI 初创公司类似，只有在 _别人给钱_ 的前提下，才付得起 _在 AI 上的巨额支出_ 。

这对 AI 实验室来说是又一层底层风险敞口，因为这些客户也是转向更便宜的自训开源模型、或最终转向端侧模型的主要目标群体。

即便他们选择继续留在 Anthropic 和 OpenAI，这部分支出中也有一部分取决于风险投资资金，其余部分则取决于科技公司是否愿意继续保持大规模支出。它们 80% 的收入集中度取决于从不可靠到极度不稳定的支出和资本。

情况从这里开始变得更加糟糕。

### OpenAI 和 Anthropic 高达 1.3 万亿美元的算力承诺已成为 AI 泡沫中的次级抵押贷款

> **旁注：** [我估计除 OpenAI 和 Anthropic 之外，每年的 AI 算力需求约为 220 亿美元](https://www.wheresyoured.at/premium-how-much-money-does-ai-need/#there-is-at-best-around-22-billion-of-non-openaianthropic-compute-demand) ，其中大部分来自 Jane Street（CoreWeave 和 OpenAI 的投资者），以及更大规模的英伟达回租自己的 GPU。我认为这个数字可能会更小，但这是根据我的分析得出的最接近的估计。
>
> 我之所以这么说，是因为我预料到有人会说 “**Ed，别人会买走这些算力的。**” 不，他们不会。正如我接下来要谈到的，那些 _本应_ 购买算力的公司根本买不起，而且没有其他任何人正在以接近这种规模的体量采购算力。

我知道几个月前我曾将 [AI 数据中心债务形容为 AI 泡沫中的次级抵押贷款](https://www.wheresyoured.at/the-subprime-data-center-crisis/#ai-data-centers-are-the-ai-bubble%E2%80%99s-subprime-mortgages) ，我坚持当时的对比，并且认为它现在依然适用。

话虽如此，另一个例子浮出水面——Anthropic 和 OpenAI 庞大的算力承诺，如今代表着超大规模云服务商和新兴云服务商超过 1.3 万亿美元的收入，这些服务商包括 [Google、微软、亚马逊](https://www.wheresyoured.at/the-ai-demand-bubble/#analysts-estimate-that-more-than-70-of-amazon-microsoft-and-google%E2%80%99s-ai-revenues-come-from-openai-and-anthropic) 、[SpaceX](https://www.anthropic.com/news/higher-limits-spacex?ref=wheresyoured.at) 、[Hut8](https://www.hut8.com/news-insights/press-releases/hut-8-announces-ai-infrastructure-partnership-with-anthropic-and-fluidstack?ref=wheresyoured.at) 、[SB Energy](https://x.com/edzitron/status/2094819233289195942?ref=wheresyoured.at) 、[甲骨文](https://www.wsj.com/business/openai-oracle-sign-300-billion-computing-deal-among-biggest-in-history-ff27c8fe?ref=wheresyoured.at) 、[Cerebras](https://www.theinformation.com/articles/openai-spend-20-billion-cerebras-chips-receive-equity-stake?rc=kz8jh3&ref=wheresyoured.at) 、[Nscale](https://www.bloomberg.com/news/articles/2026-08-26/anthropic-to-pay-nscale-45-billion-for-ai-computing-power?ref=wheresyoured.at) 和 [Lambda](https://www.reuters.com/technology/anthropic-signs-35-billion-cloud-deal-with-nvidia-backed-lambda-source-says-2026-08-31/?ref=wheresyoured.at) 。

具体而言，[根据《华尔街日报》报道](https://www.wsj.com/tech/openais-planned-cloud-spending-hits-750-billion-as-computing-efforts-ramp-up-6ac3f58a?ref=wheresyoured.at) ，在 2026 年 7 月与 SB Energy 签署协议之前（[详情见此](https://www.wheresyoured.at/premium-the-haters-guide-to-circular-financing-part-two/#what-is-sb-energy) ），OpenAI 预计到 2030 年底在算力上的支出将超过 7500 亿美元；而 [根据 The Information 的调查](https://www.datacenterdynamics.com/en/news/anthropic-signed-517bn-in-compute-agreements-in-past-11-months/?ref=wheresyoured.at) ，Anthropic 在过去 11 个月内签署了约 5170 亿美元的协议。

据我所知，这些都是 “照付不议（take-or-pay）” 协议，即无论他们最终实际使用了多少算力、带来了多少收入，他们都同意按约定的算力容量付款。

当算力可用或即将可用时，你必须在开始使用之前预先支付一大笔资金。

需要提醒的是，两家公司都处于严重亏损状态，每年亏损数百亿美元。即使他们 _有_ 盈利能力，其承诺的绝对规模也是惊人的，对全球一些最大的公司构成了巨大的底层风险。

为了让大家对这种风险有所了解，[彭博社指出](https://www.bloomberg.com/news/articles/2026-08-05/microsoft-s-ai-sales-mostly-come-from-openai-disclosures-show?ref=wheresyoured.at) ，在刚于 6 月结束的 2026 财年中，OpenAI 的算力支出和收入分成约占微软 AI 收入的 70%，占微软整个财年总收入的 7% 以上；而 [瑞银（UBS）估计](https://www.wheresyoured.at/the-ai-demand-bubble/#analysts-estimate-anthropic-and-openai-represent-more-than-70-of-all-ai-revenues-and-we-are-building-hundreds-of-billions-of-dollars-of-data-centers-for-nobody) ，Anthropic 和 OpenAI 的算力支出将在 2027 年占到 Google Cloud 总收入的 48%，金额在 840 亿至 1000 亿美元之间。

除此之外，根据巴克莱银行（Barclays）的估计，OpenAI 和 Anthropic 在亚马逊 AWS 上的支出估计为 400 亿美元，并且在 2027 日历年中，两者在微软 Azure 上的支出至少为 500 亿美元（我特别指出日历年是因为微软使用的是其特殊的财年体系）。

按保守估计，这意味着 Anthropic 和 OpenAI 将占微软、谷歌和亚马逊在 2027 年预期收入的 2000 亿美元以上，而这取决于它们筹集风险投资或债务的能力，这又取决于其业务的持续增长，而这又取决于来自极少数客户群体的 _AI 支出增长_ ——其中许多客户本身就是靠风投资助的。

之所以迄今为止这还没有成为问题，是因为在签署这些合同时，你往往只需要预付一小笔费用，而相关的算力设施尚未正式上线投入运行。

Anthropic 或 OpenAI 只要支付少量的现金，并在 DocuSign 协议上点几下，就可以签署价值数千亿美元的债务责任，这意味着在 _必须开始付款的日期到来_ 之前，所有这些 _算力容量_ 都不会让他们付出 _任何代价_ 。

这种情况将于明年开始发生，并随着算力设施的陆续上线而逐月急剧恶化。

嘿，_这_ 也让我想起了某件事。

### 集中度风险 3：OpenAI 和 Anthropic 将于 2027 年及以后大规模生效的算力承诺，就是 AI 泡沫中的浮动利率抵押贷款，而超大规模云服务商就是银行

在我看来，Anthropic 和 OpenAI 的算力承诺更应该被视为 _债务义务_ 而非普通 “合同”，因为它们（作为照付不议协议）的运作方式基本相同，无论公司是否需要这些算力都必须履约付款。

目前来看，一切似乎都 _棒极了_ 。微软、谷歌和亚马逊来自 AI 实验室算力支出的收入都有大幅增长，同时积压了巨额且不断膨胀的待履行收入订单（revenue backlogs）——具体而言超过 1.5 万亿美元。其中超过一半的积压订单 [归属于 Anthropic 和 OpenAI](https://www.theinformation.com/articles/anthropic-commits-spending-200-billion-googles-cloud-chips?ref=wheresyoured.at) ，正如我一次又一次说过的，这目前还不是问题，因为资金还没有停止流入。

![](/images/substack/wheres-your-ed-at/b6ffcd2c3b8a4c6c3eef.jpg)

如前所述，这将在 2027 年正式开始，并在随后的每一年急剧扩大（尽管我怀疑我们能不能撑到那么久）。

一家名为 Groundbreaker 的机构发表了一篇 [写得极差的文章](https://www.groundbrkr.com/p/the-teaser-period-why-the-ai-boom?ref=wheresyoured.at) （全是用 LLM 生成的错误数据且毫无引用出处），但它指出了一个很好的切入点：将这一现象比作数百万抵押贷款在遭遇 “利率重置墙（reset wall）” 时利率暴增的情景——当时较低的 “诱饵利率（teaser rates）” 结束，每月抵押贷款还款额暴涨至无法维持的高点，而客户却错误地以为自己的房产会持续升值或者能够办理重新按揭。

换句话说，Anthropic 和 OpenAI 目前正处于诱饵利率期，所有这些算力容量——以及所有相关的成本——尚未真正砸向它们。

明年，至少 2000 亿美元的算力成本将到期。

问题是，Anthropic 和 OpenAI 这两家每年亏损数百亿美元、不可持续且毫无盈利能力的 AI 实验室，是否有能力支付这些费用。

如果你去问绝大多数科技与商业记者、顾问或卖方分析师，他们会告诉你别担心——[对算力的需求是永不满足的](https://www.bain.com/insights/how-can-we-meet-ais-insatiable-demand-for-compute-power-technology-report-2025/?ref=wheresyoured.at) ，甚至说这种需求 “[可能永远无法被填满](https://www.ft.com/content/27c07fd7-dc7d-42ec-9b89-38bb14cc1676?syn-25a6b1a6=1&ref=wheresyoured.at) ”，而且即使存在泡沫，[无论如何社会都将获得 “巨大的利益”](https://www.cnbc.com/2025/10/03/jeff-bezos-ai-in-an-industrial-bubble-but-society-to-benefit.html?ref=wheresyoured.at) 。这些观点总是得到业内数据的支撑，而出于某种原因，业界在谈及自身状况时总被认为是诚实的。

大多数人会提出的论点是，Anthropic 和 OpenAI 都能够买下所有这些算力，即使他们买不起，其他客户也会排队接盘。当被追问大型 AI 实验室将如何实际 _负担_ 得起这些算力时，每个人都会告诉你 “它们是全球增长最快的公司”。

而在目前的情况下，我们谈论的是来自 _两家客户_ 的 1.3 万亿美元需求，而这两家客户拥有的 _几百家客户_ 又是 _主要基于风险投资资金的可获得性来向其付款的。_

虽然其后果可能有所不同——大金融危机的规模和破坏性是由数万亿美元的投机推动的——但如今犯下的错误正变得越来越相似。

那些自我合理化的托辞也是如此。

### 让我们来谈谈诱饵利率

在大金融危机爆发前的那段时期，美国 [大约 80%](https://predatorylending.duke.edu/business-analysis/evolution-of-mortgage-lending/subprime-lending/?ref=wheresyoured.at) 的次贷借款人获得了带有 “诱饵利率” 的浮动利率抵押贷款——在最初的两到三年内享受较低的利率，随后转为浮动利率，随基准利率以及在某些情况下与该调整相关的费用而变动。

这些抵押贷款被称为 2/28 或 3/27 贷款，取决于诱饵期是持续两年还是三年。需要注意的重要一点是，“诱饵利率” 绝不意味着 _低_ （它们可能高达 7%），只是它们比正常利率 _更低_ 。

当借款人担心未来每月还款额可能增加时，他们得到的保证是他们可以办理重新按揭，或者房产价格只会永远上涨。

[根据美国联邦存款保险公司（FDIC）关于大金融危机的报告](https://www.fdic.gov/media/18636?ref=wheresyoured.at) ：

> 在当时较为宽松的核保标准下，许多借款人仅凭其根据入门诱饵利率确定的初始低月供支付能力，就获得了浮动利率抵押贷款的资格。因此，在诱饵利率到期后，他们承担抵押贷款的能力取决于他们在更高还款额生效前进行重新按揭的能力。
>
> 重新按揭的能力——受到许多投资者、购房者和贷款发放机构的倚重——严重依赖于房价。只要房价上涨，贷款机构通常愿意以新条款提供新资金。即使在全美房价于 2006 年年中见顶之后，房地产市场参与者普遍也没有预料到房价会暴跌。

### 媒体是如何像报道 AI 一样掩盖（或彻底无视）大金融危机的

尽管早在 2002 年 8 月就出现了关于房地产泡沫的警告（[干得好，迪恩·贝克（Dean Baker）！](https://wayback.archive-it.org/all/20090423085253/http://www.cepr.net/index.php/publications/reports/the-run-up-in-home-prices-is-it-real-or-is-it-another-bubble/?ref=wheresyoured.at) ），但当时普遍（尽管不是完全）达成的共识是：事实上根本不存在房地产泡沫。[2005 年 8 月](https://web.archive.org/web/20051126044138/http://www.realtor.org/research.nsf/pages/anti-bubblereports) ，美国全国房地产经纪人协会（NAR）发布了多份 “反泡沫” 报告，称在 130 个特定市场 _以及全美范围内_ ，“事实根本不支持房地产崩盘的可能性”。随后获得美联储主席提名的本·伯南克（Ben Bernanke）[在 2005 年 10 月表示](https://www.nbcnews.com/id/wbna9831894?ref=wheresyoured.at) ，“不存在会破裂的房地产泡沫”，并指出即便房地产市场出现 “温和降温”，“也不会妨碍经济在明年继续以接近其潜力的速度增长”。

然而我最喜欢的例子来自 [2005 年 7 月](https://www.wsj.com/articles/SB112250505320798017?ref=wheresyoured.at) ，当时《华尔街日报》的尼尔·巴尔斯基（Neil Barsky）（在一篇名为《什么房地产泡沫？》的文章中）嘲讽《经济学人》将其称为 “历史上最大的泡沫”，痛斥 “媒体和经济学家用末日阴郁的言辞吓唬房主，无论这些言辞多么条件反射、随波逐流且具有误导性”，并称 “[美国] 不存在房地产泡沫”。

他的理由是，房地产市场的强劲是 “真正的经济支撑” 带来的结果，例如 “低利率、当地就业增长以及人们对住房的情感依恋”。

然而最相关的论据是，他将强劲的房地产市场与 “对个人未来赚钱能力的看法” 这一 “真正的经济支撑” 联系在一起，并发表了对 _住房需求_ 的看法：

> 我们面临的实际上是严重的住房短缺和住房负担能力危机。尽管建设强劲，但未售出的库存仅够维持四个月，远低于 25 年的平均水平。私营建筑商抱怨他们拿不到满足需求所需的土地许可。低收入住房倡导者抱怨许多美国人买不起房，而且政府补贴已被大幅削减。

嘿，这倒让我想起了 [英伟达首席财务官科莱特·克雷斯（Colette Kress）在最近一次财报电话会议上的发言](https://www.investing.com/news/transcripts/earnings-call-transcript-nvidia-beats-q2-2026-estimates-as-ai-demand-stays-hot-93CH-4878028?ref=wheresyoured.at) ：

> 前沿 AI 实验室对训练和推理算力有着异乎寻常的需求，但它们的增长速度超过了其资产负债表和信用状况所能支撑的水平。它们拥有迅速增长的客户需求，但仍缺乏独立获得 AI 工厂基础设施所需的数十年长期基础设施合同和投资级融资能力。换句话说，它们的增长不受技术或客户需求的限制。它受限于算力。

这篇文章棒极了，主要是基于它对 “高风险抵押贷款产品正在推高房价” 这一 “神话” 的回应，该回应大体归结为 “房主平均只持有房屋七年 [注：他对此说法没有任何引用来源]，这意味着如果不选择浮动利率抵押贷款，你基本上就是在浪费钱”。

我还可以继续举例。2006 年 12 月 21 日，[CNBC 的戴安娜·奥利克（Diana Olick）发表了一篇文章](https://www.cnbc.com/2006/12/21/by-the-numbers.html?ref=wheresyoured.at) ，回应读者对全美房地产经纪人协会、商务部和全美住宅建筑商协会提供的住房数据的反馈：

> 另一位 [读者] 迈克尔·克雷斯皮（Michael Crespy）写道：“虽然你们节目偶尔会请一位‘房地产看空派’，但大多数时候，节目里坐满了来自 NAR 或 NAB 的‘经济学家’，他们不过是房地产行业的头号啦啦队长！！”
>
> 克雷斯皮先生，你说得对，他们确实是房地产行业的啦啦队长，但他们也是经济学家，其唯一目的就是组织和展示该行业的数据。有趣的是，与该行业没有任何利益关系的商务部，其数据的误差幅度远远高于行业数据。NAR 的现有成屋数据受到美联储的监控，其误差幅度为 1%。他们的数据来自 40% 的 MLS 房源抽样。在调查领域，40% 的比例已经相当高了。

奥利克的文章至少在表面上试图维持一种 “平衡” 的视角，但最终基本上是在论证一切安好，甚至引用了沃顿商学院教授苏珊·沃赫特（Susan Wachter）的话，后者表示那些显示情况正在 “改善” 的数据 “在某些方面 [给予了她] 信心”，并补充说她对房地产经纪人或住宅建筑商的统计数据没有异议。

感到被冒犯的奥利克在文章结尾这样写道：

> 在 Realty Check 栏目，我们报道数据，采访行业领袖，也采访实地无数的经纪人、研究房地产趋势的经济学家，以及试图理解这一切的买家和卖家；然后，无论好坏，我们尝试理清头绪。我承认，我确实拥有一套房子，所以这是我的偏见；我希望它继续升值。如果你不买账我的报道，那是你的选择。

现在，为她说句公道话，如果你 _眯起眼睛仔细看_ ，也许这些数据 _确实_ 显示一切安好，但奥利克对那些称她为 “行业的辩护者或捍卫者” 的担忧读者的刻薄态度，而不是选择去 _实地展开新闻调查_ ……几乎完全映射了今天关于 AI 的所有报道，这些报道大多在大喊 “_数据看起来好极了！_”，同时对那些不乐观的数据视而不见。

不到一周后的 2006 年 12 月 27 日，CNBC 发表了一篇题为 “ [分析师：对房地产泡沫的担忧已成过去](https://www.cnbc.com/2006/12/27/analyst-housing-bubble-fears-behind-us.html?ref=wheresyoured.at) ” 的报道，援引前美国国际贸易委员会经济学家彼得·莫里奇（Peter Morici）的话称，房屋销售数据是 “经济的特大利好”，并且他 “预计新房开工量将在 2007 年第二和第三季度出现反弹”。

[而实际发生的情况是这样的](https://fred.stlouisfed.org/series/houst?ref=wheresyoured.at) ：

![](/images/substack/wheres-your-ed-at/d641beecdd3228c5fb7d.png)

### 浮动利率的 “重置墙” 始于 2007 年——而 Anthropic 和 OpenAI 的算力重置墙将于 2027 年开启

### 浮动利率 “重置墙”——以及狂热是如何演变成灾难的

> **_术语时间！_** 这里的 “重置（reset）” 指的是抵押贷款从较低的 “诱饵利率” 转变为根据贷款条款和当前利率变动的浮动利率，从而大幅增加你每月的还款额。

我必须澄清，启发了本文的 [Groundbreaker 文章](https://www.groundbrkr.com/p/the-teaser-period-why-the-ai-boom?ref=wheresyoured.at) 是一篇写得非常糟糕的 Claude 生成物，但提出这个概念值得赞许，哪怕它搞错了几乎所有数字，实际上毫无引用，并且有着几乎晦涩难懂的文字，我甚至不确定大多数人有没有读完它。

> **旁注** ：“重置墙（Reset wall）” 似乎是一个 _事后_ 才被广泛采用的词汇，并没有出现在次贷危机发生时的当期报道中。那个时期的报道使用的是 “利率重置（rate reset）” 一词。

尽管如此，我必须引用它的一段话：

> 在那一刻，数以百万计的次级贷款借款人正在支付两年期浮动利率抵押贷款（2/28 ARM）的低廉入门利率。前两年是固定的低利率，之后利率重置，月供增加 30% 到 50%。在那最初的两年里，贷款表现得非常完美：借款人按时还款，服务商按时收钱，债券按时支付票息。一切看起来都毫无问题，因为整个复合体系——房地产、抵押贷款、证券化——都处在诱饵期内。
>
> 每笔 ARM 的重置从发放的那一刻起就是已知的、确定的，且在合同上不可避免的。将这些重置时间表汇总起来，你就会得到那个时代最具毁灭性的证据：重置墙。大约一万亿美元的浮动利率抵押贷款在合同上被设定在 2007 年和 2008 年期间重置——在高峰期达到每月 300 亿到 400 亿美元。瑞士信贷于 2007 年 3 月发布了这张图表。国际货币基金组织（IMF）转载了它。它流传在纽约和伦敦的每一个交易大厅。

Groundbreaker 没有任何引用出处，所以我 [去实际找到了 IMF 转载自瑞士信贷的图表](https://www.calculatedriskblog.com/2007/10/imf-mortgage-reset-chart.html?ref=wheresyoured.at) ：

![](/images/substack/wheres-your-ed-at/81a7d0c782c4f35113b9.png)

这里的 “墙” 指的是从 2007 年开始，庞大的次级借款人群体每月按揭还款额将暴涨数百亿美元（正如 Groundbreaker 正确指出的那样）。

> **旁注：** 尽管公开数据并不算多，但 [美国进步中心（Center For American Progress）](https://www.americanprogress.org/article/subprime-mortgages-by-the-numbers/?ref=wheresyoured.at) 指出，在 2007 年和 2008 年，有 180 万笔抵押贷款已经或即将遭遇利率重置。

换句话说，在每个人都必须支付更多资金 _之前_ ，_一切看起来都很正常_ ，因为 _每个人都还能还得起钱。_ 一旦他们 _必须开始支付更高的款项_ 却 _无法支付_ 时，抵押贷款违约率从 2007 年 1 月起逐月上升，[在 _三年多后_ 的 2010 年 3 月达到 11.49% 的峰值](https://www.macrotrends.net/3047/us-mortgage-delinquency-rate?ref=wheresyoured.at) ，又花了 _整整六年_ 时间才降至 5% 以下。

你还会注意到，所有的一切崩盘得 _非常迅速_ ，其中大部分始于 2007 年和 2008 年诱饵利率结束之时。[次级抵押贷款的发放量崩溃](https://www.researchgate.net/figure/US-Subprime-Mortgage-Originations-from-1996-to-2008-source-Inside-Mortgage-Finance_fig1_333894677?ref=wheresyoured.at) 于 2008 年底，因为来自银行和金融机构的私标证券化（根据 FDIC 报告 [第 19 页](https://www.fdic.gov/media/18636?ref=wheresyoured.at) ）——曾 “为新增抵押贷款提供了大部分资金”——急剧下降，到 2008 年已 “几乎消失殆尽”。

正如我们现在所知，资助新增抵押贷款的这种狂热与 _建造房屋_ 几乎毫无关系，它更多是 _为投资者提供一种用于投机的新资产类别。_

而且极其重要的是，次级抵押贷款发放的大规模扩张主要发生在短短三年时间内。虽然这股新建住房开发和抵押贷款发放的热潮被向所有人兜售为 _对住房的无尽需求_ 所致，但这种住房需求其实是由 _在历史狂热期内向根本买不起房的人提供的大量唾手可得的资金_ 驱动的。

_你大概能看出我要表达什么了。_

![](/images/substack/wheres-your-ed-at/c5066022f54ce4057879.png)

### AI 泡沫重置墙——从 2027 年开始算力承诺将超过 2000 亿美元，且逐年增长，而 OpenAI 和 Anthropic 都无力承担

在大金融危机爆发前的几年里，一切看起来都 _完全正常_ ，因为从外部数据来看，_钱还没断流。_ 因为几乎任何人都能拿到抵押贷款，到 2006 年 [美国建筑支出几乎占到了 GDP 的 9%](https://www.everycrsreport.com/reports/R41806.html?ref=wheresyoured.at) ，雇佣了 770 万人，这一切都是因为次级贷款制造的虚假需求催生了对住房的 “需求”。

虽然当时没有人能预料到最终瓦解全球金融体系的投机狂潮会达到何种 _规模_ ，但关于次贷借款人存在问题的报道早已屡见不鲜。不过别担心，[布鲁金斯学会（The Brookings Institute）在 2007 年 10 月曾解释说这不会成为问题](https://www.brookings.edu/articles/credit-crisis-the-sky-is-not-falling/?ref=wheresyoured.at) ，黑体为我所加：

> 然而，除非美国经济大幅下滑，**绝大多数次级抵押贷款都会得到偿还**。而且，**由于根本不存在资金短缺，投资者仍拥有巨额金融资本必须寻找去处投放。**

尽管如此，2007 年 11 月，美联储理事兰德尔·S·克罗斯纳（Randall S. Kroszner）确实发出了非常明确的警告：

> 最后，可能影响次贷违约率的另一个因素是首次利率重置时通常经历的大幅还款额增加。对于最常见的次级浮动利率贷款类型，即所谓的 “2/28” 贷款，这种重置发生在两年之后，在此之前还款通常基于低于市场水平的固定利率。在 2007 年初，经历首次重置的典型次级抵押贷款利率从 7% 上升到 9.5%，导致月供增加 25% 到 30%。这种增长转化为普通次级浮动利率抵押贷款每月额外增加 350 美元的债务负担。

而最有趣的部分在于：**如果你愿意去探究，Anthropic 和 OpenAI 的重置墙实际上要简单得多、集中得多，也更容易被发现！**

正如我在几周前的付费文章（[《AI 需要多少钱？》](https://www.wheresyoured.at/premium-how-much-money-does-ai-need/) ）中提到的那样，[来自瑞银、巴克莱和富国银行的分析师](https://www.wheresyoured.at/premium-how-much-money-does-ai-need/#google-microsoft-and-amazon-need-anthropic-and-openai-to-spend-at-least-444-billion-in-the-next-three-years-to-meet-analyst-expectations-with-anthropic-and-openai-representing-over-34-of-cloud-revenue-in-fiscal-year-2027) 预计——我的意思是他们正在 _建立预期_ ——Anthropic 和 OpenAI 将在未来三年内贡献超大规模云服务商至少 4440 亿美元的收益。

具体而言，[我汇总了几周前 AI 需求泡沫通讯中的所有数据](https://www.wheresyoured.at/the-ai-demand-bubble/#there-isn%E2%80%99t-really-an-ai-industry-without-openai-and-anthropic:~:text=been%20a%20waste.-,There%20Isn%E2%80%99t%20Really%20An%20AI%20Industry%20Without%20OpenAI%20and%20Anthropic,-So%2C%20let%E2%80%99s%20go) ，发现 Anthropic 和 OpenAI 将在 2026、2027 和 2028 财年贡献至少 3650 亿美元的收入。

> **旁注：** 除非这一分析仅为部分完整，因为它是基于富国银行单就 2027 财年对 OpenAI 和 Anthropic 预计贡献 525 亿美元的单一估计。该分析的一个弱点在于我们讨论的是微软的 2027 财年，该财年实际上始于 2026 年年中。大多数其他超大规模服务商（包括亚马逊、Meta 和谷歌）的财年与日历年保持一致。尽管如此，我认为这相当能说明问题。

为了估算其贡献——并且做到极尽公允！——我假设 OpenAI 和 Anthropic 在微软身上的支出在 2028 财年呈线性分布（为 525 亿美元），然后在 2029 财年减半，这使我们得出了 4440 亿美元的总额。

![](/images/substack/wheres-your-ed-at/d9e828d06aad3b955f20.png)

成本的激增来自 [瑞银分析师 Stephen Ju 的估计](https://www.wheresyoured.at/the-ai-demand-bubble/#:~:text=Eagle%2Deyed%20readers%20will%20also%20see%20that%20Google%E2%80%99s%20non%2DAI%20cloud%20business%20is%20estimated%20to%20be%20effectively%20flat%20in%202026%2C%202027%2C%20and%202028.) ，即便你认为这有点 _过高_ ，我估计 [仅 OpenAI 一家在微软 Azure 上做出的 2500 亿美元承诺](https://www.cnbc.com/2026/04/27/openai-microsoft-partnership-revenue-cap.html?ref=wheresyoured.at) ，就意味着微软在 27 财年及以后的预期收入将远不止 525 亿美元。

我还必须指明，_这比这些公司已经在算力上花费的资金要多得多。_

在 2025 年，OpenAI 在算力上的支出（[根据我自己的报道，假设销售和营销费用的 50% 为算力开销](https://www.wheresyoured.at/exclusive-openai-financials/) ）略高于 295 亿美元。[根据 The Information 的报道](https://www.theinformation.com/articles/openai-burned-3-7-billion-first-three-months-2026?rc=kz8jh3&ref=wheresyoured.at) ，它在 _2026 年第一季度_ 花费了 121 亿美元（未扣除销售和营销费用），虽然我们不知道它在第二季度花了多少（[当时收入环比增长了 10 亿美元](https://www.wsj.com/tech/ai/openais-second-quarter-sales-show-tepid-growth-compared-with-anthropic-5cb42998?ref=wheresyoured.at) ），但有理由假设在今年剩余时间里它每季度还将花费约 120 亿美元，总计 484 亿美元，这低于 [它此前宣称预计在 2026 年用于算力的 500 亿美元](https://www.bloomberg.com/news/articles/2026-05-05/openai-to-spend-50-billion-on-computing-in-2026-brockman-says?ref=wheresyoured.at) 。

根据巴克莱银行和瑞银的预测，OpenAI 预计在 2027 年向 AWS 支付 150 亿美元，向 Google Cloud 支付 125 亿美元，而富国银行估计其在 2027 年前两季度的支出为 229 亿美元，由此合理推算全年至少为 450 亿美元，总额达 725 亿美元……_即便如此_ ，根据其在 2026 年的支出轨迹来看，这个数字似乎仍然偏低。

接下来你还得加上甲骨文与 OpenAI 达成的 3000 亿美元、为期五年的交易中的另外 300 亿美元，[《华尔街日报》报道称该交易预计从 2027 年开始带来 300 亿美元收入](https://www.wsj.com/business/openai-oracle-sign-300-billion-computing-deal-among-biggest-in-history-ff27c8fe?ref=wheresyoured.at) ，不过 [我自己的研究发现它可能超过 500 亿或 600 亿美元](https://www.wheresyoured.at/oracle-openai/#oracle-cannot-build-capacity-quick-enough-to-make-any-of-the-money-it-has-projected-for-fy2027-fy2028-fy2029-or-fy2030-%E2%80%94-not-that-it-will-ever-exist) 。

与此同时，Anthropic 预计在 2027 年向 AWS 支付 253 亿美元，向 Google Cloud 支付 1012.5 亿美元，到 2028 年对 AWS 的支出增至 358 亿美元，对 Google Cloud 的支出 _降至_ 256 亿美元，这可能是因为初期成本主要在于采购 TPU。从那之后，[Anthropic 承担了 350 亿美元的债务以向博通（Broadcom）采购 TPU](https://www.reuters.com/business/apollo-blackstone-back-anthropics-35-billion-capacity-expansion-new-broadcom-tie-2026-06-09/?ref=wheresyoured.at) （博通也为该债务提供了担保），并且 [可能还会达成另一项 700 亿美元的交易](https://www.cnbc.com/2026/08/21/broadcom-debt-deal-expected-to-reach-upwards-of-70-billion-sources.html?ref=wheresyoured.at) 。

我甚至还没有把 [两家](https://investors.coreweave.com/news/news-details/2025/CoreWeave-Expands-Agreement-with-OpenAI-by-up-to-6-5B/default.aspx?ref=wheresyoured.at) [公司](https://finance.yahoo.com/sectors/technology/article/coreweave-stock-soars-13-on-anthropic-deal-141357680.html?ref=wheresyoured.at) 与 CoreWeave 的交易、OpenAI 与 Cerebras 的合同、Anthropic 与 SpaceX 的交易，或者 [The Information 关于 Anthropic 5170 亿美元算力承诺的报道](https://www.datacenterdynamics.com/en/news/anthropic-signed-517bn-in-compute-agreements-in-past-11-months/?ref=wheresyoured.at) 中提到的许多交易计算在内。

### 我们不知道算力重置墙的确切规模，这极其糟糕

由于 Anthropic 和 OpenAI 都是非上市公司，而且针对未履约收入订单的披露缺乏任何有意义的会计准则，我们只能估算算力重置墙 _在任何特定时间点_ 的规模究竟有多大。

部分问题在于我们不知道究竟有多少算力容量会实际投入运营（[因为超大规模服务商拒绝提供任何透明度](https://www.theguardian.com/technology/2026/aug/17/are-microsofts-ai-plans-being-held-back-by-a-shortage-of-chips?ref=wheresyoured.at) ），而 _只有算力实际上线，Anthropic 和 OpenAI 才会为其付款。_ 这一点令人沮丧，因为这意味着很难将 “1.3 万亿美元” 这个数字精准挂钩到具体的时间段上。

话虽如此，我们确实知道 [《华尔街日报》指出 OpenAI 预计到 2030 年底在算力上投入 7500 亿美元](https://www.wsj.com/tech/openais-planned-cloud-spending-hits-750-billion-as-computing-efforts-ramp-up-6ac3f58a?ref=wheresyoured.at) ，这表明每年的算力支出至少为 2500 亿美元。

如果不是这样，就意味着在 2028 年或 2029 年，它的承诺支出可能会飙升至每年 3000 亿或 4000 亿美元。

这算好事吗？

### OpenAI 和 Anthropic 的次级算力承诺等同于缺乏严格审核的债务

让我们把事情彻底讲清楚：除了那类 _注定会出问题_ 的盲目信任之外，谷歌、微软、亚马逊和各类新兴云服务商没有任何合乎理性或负责任的理由允许 Anthropic 和 OpenAI 签署如此庞大的算力容量协议。如果 OpenAI 和 Anthropic 在未来三年内不能实现约 10 倍的增长，并在某个时间点找到盈利的方法（这需要至少一万亿美元的资金或债务），它们就根本无力承担这些承诺。

超大规模服务商之所以做出这一切，完全是基于导致次级（以及原本优质但无法偿付的）抵押贷款大规模发行并导致房屋过度建设的同一种逻辑——那就是资金尚未停止被挥霍。风险投资和私人信贷联合起来不断向 Anthropic 和 OpenAI 输送资金（超大规模服务商自身也在其中），就像它们不断向两家公司理论上将入驻的数据中心项目输送资金一样。

同样地，超大规模服务商继续为 Anthropic 和 OpenAI 构建算力设施，也是基于它们会继续付款的预设，而这种预设主要是因为它们目前尚未停止付款。它们以某种方式认定，OpenAI 和 Anthropic 每年向其支付数百亿美元的能力，足以证明它们未来有能力支付数千亿美元。

> **旁注：** 看到这里，我真的很想引用 Groundbreaker 的图表，但说实话，他们的数据简直就是一堆狗屎——Anthropic 和 OpenAI 在 2026 年极不可能在算力上花费超过 1200 亿美元，而且我完全找不到任何支持这些数据的证据。尽管如此，这堆 Claude 生产的垃圾确实指出了几个有价值的观点，我不得不引用它。

[根据 Groundbreaker](https://www.groundbrkr.com/p/the-teaser-period-why-the-ai-boom?ref=wheresyoured.at#:~:text=III.%20Take%2Dor%2DPay%20is%20Debt) ：

> 照付不议合同在经济实质上是一种租赁。而租赁就是一种融资。债务的决定性特征是按时间表进行固定付款，无论借款人的处境如何都必须偿还。这正是照付不议承诺的本质。付款不会随使用率的变化而浮动。它不会等待客户产生收入。它在生效日以及之后的每个履约周期内都必须按期支付，直至合同期满。

这是完全正确的，当然，除非你是科技与财经媒体的一员，在这种情况下，它就变成了 “一笔数额巨大但当然会按时足额支付的款项”。

那么，让我为大家提供一些背景信息，来说明这些承诺的数额有多庞大。[微软过去十二个月的运营支出为 1760 亿美元](https://www.macrotrends.net/stocks/charts/MSFT/microsoft/operating-expenses?ref=wheresyoured.at) ，而该公司的 [年收入为 3310 亿美元](https://www.macrotrends.net/stocks/charts/MSFT/microsoft/revenue?ref=wheresyoured.at) 。Meta [年收入为 2280 亿美元](https://www.macrotrends.net/stocks/charts/META/meta-platforms/operating-expenses?ref=wheresyoured.at) ，其 [运营支出约为 1410 亿美元](https://www.macrotrends.net/stocks/charts/META/meta-platforms/operating-expenses?ref=wheresyoured.at) 。Salesforce [年收入略低于 440 亿美元](https://www.macrotrends.net/stocks/charts/CRM/salesforce/revenue?ref=wheresyoured.at) ，[运营支出为 350 亿美元](https://www.macrotrends.net/stocks/charts/CRM/salesforce/operating-expenses?ref=wheresyoured.at) 。

而在 2025 年，OpenAI [在 130.7 亿美元的收入下产生了 340 亿美元的运营支出](https://www.wheresyoured.at/exclusive-openai-financials/) 。在 2026 年第二季度，[其营业利润率恶化至负 183%](https://x.com/edzitron/status/2089865603188494581?ref=wheresyoured.at) 。这是一家财务状况不断恶化的公司，却被允许签署价值数千亿美元的算力承诺，其主要依据不过是萨姆·奥尔特曼（Sam Altman）满口答应的能力，以及人们普遍抱有的 “坏事永远不会降临” 的侥幸心理。

我认为，这些承诺是在几乎没有任何实质核保的情况下签署的，因为任何有计算器和基本理智的人都能在账面上看出，这些公司 _根本负担不起它们的承诺。_ 其背后的托辞与用来淡化对次贷违约担忧的托辞完全一致——体系正在运转，体系总会自我修正，而且一切都在持续增长。

无论如何，**OpenAI 和 Anthropic 实际上都没有足够的资金来履行其义务**，它们之所以能撑到现在，完全是因为 _签署合同_ 的初始成本极低。

随着这些承诺开始生效，它们对资金的需求将以可怕的幅度急剧加速，无论是面对超大规模服务商还是新兴云合作伙伴，更不用说它们为资助自研芯片而与博通签署的任何债务协议了。

**而且绝大多数承诺和付款尚未真正发生，正如本期通讯的主题一样，这就是为什么目前还没有人感到担心的原因。**

与此同时，在更高一层抽象维度上，哪怕是那些在 AI 泡沫中真正实现盈利的公司，也暴露在 Anthropic 和 OpenAI 的底层风险之下。

### 集中度风险 4：博通和英伟达的客户都依赖 Anthropic 和 OpenAI 来变现其 AI 芯片

在这一点上，我将不再直接与大金融危机进行对比，因为我认为这会妨碍分析，但我们必须明确一点：**无论是直接还是间接，英伟达的客户群体实质上就是 Anthropic 和 OpenAI。**

[正如我在《循环融资厌恶者指南》（Hater's Guide To Circular Financing）第二部分中所探讨的](https://www.wheresyoured.at/premium-the-haters-guide-to-circular-financing-part-two/#openai-and-anthropic-mostly-exist-to-power-circular-financing) ，OpenAI 和 Anthropic 对超大规模服务商和英伟达起到了两个作用：

- 它们是 AI 算力的最大直接消费者，无论是通过直接合同还是通过超大规模服务商转租算力（例如：Nebius 与微软、Lambda 与微软/亚马逊、CoreWeave 与微软），[占谷歌、微软、亚马逊、甲骨文、SpaceX、Cerebras 和 Lambda 所有 AI 收入的 70% 以上](https://www.wheresyoured.at/the-ai-demand-bubble/#analysts-estimate-that-more-than-70-of-amazon-microsoft-and-google%E2%80%99s-ai-revenues-come-from-openai-and-anthropic) 。
- 它们是通过待履行收入订单制造需求假象的工具。

具体到第二点，每当你听到有人说 “对 AI 算力存在巨大需求” 时，他们总是指向待履行收入订单，而这些订单在很大程度上要么来自 OpenAI、Anthropic，要么来自向它们转租算力的第三方。例如，[CoreWeave 发布的最新财报](https://investors.coreweave.com/news/news-details/2026/CoreWeave-Reports-Strong-Second-Quarter-2026-Results/default.aspx?ref=wheresyoured.at) 中包含了一句极具欺骗性的声明，称其 “[1040 亿美元] 的待履行收入订单 [凸显了] 对 CoreWeave Cloud 空前的需求”，尽管其中 224 亿美元来自 OpenAI，210 亿美元来自 Meta，[60 亿美元来自 Jane Street](https://www.coreweave.com/news/jane-street-signs-6-billion-ai-cloud-agreement-with-coreweave?ref=wheresyoured.at) （也是其投资方），其余则来自 Anthropic、微软以及 [英伟达购买未利用算力的 63 亿美元兜底协议](https://finance.yahoo.com/news/coreweaves-6-3-billion-backstop-103000258.html?ref=wheresyoured.at) 的某种组合。具体而言，在与 Anthropic 达成交易后紧随其后的财报中，CoreWeave 的积压订单猛增了 326 亿美元。

这些未履行订单既作为循环融资存在，也是一种金融化的营销手段。

从外部看，每家拥有大量 AI 算力的公司都握有惊人规模的积压订单，所有人都以为这些算力肯定会卖给各种各样的多元化客户群体，而不是集中在 Anthropic、OpenAI 以及有朝一日可能向它们出售算力的公司身上。

换句话说，一切都建立在这样一个假设之上：Anthropic 和 OpenAI A）将对算力拥有近乎无限的需求；B）它们的存在本身就证明了其他人也会有同样的需求。

另一个问题在于，英伟达的 GPU 实在是太贵了，以至于没有人——包括全球最大、最富有的公司（除微软外）——能够在不承担近乎无限债务的情况下持续采购它们并建设数据中心，这使得潜在客户群急剧缩小。

这一点在 [英伟达最新的财报](https://s201.q4cdn.com/141608511/files/doc_financials/2027/NVDA-2027-Q2-10Q-Final-including-exhibits.pdf?ref=wheresyoured.at) 中已经显露端倪。在其 2027 财年迄今为止（两个季度）的收入中，将近一半（44%）来自三家客户，而其最近一个季度收入的 16% 来自单一客户，很可能是为 Anthropic 提供算力的 SpaceX。[根据我最近的付费通讯](https://www.wheresyoured.at/premium-the-haters-guide-to-nvidia-part-2/#:~:text=money%20on%20them.-,The,-problem%20is%20that) ，瑞银估计英伟达数据中心收入的大约 50% 来自 Meta、谷歌、微软、亚马逊和甲骨文，而德意志银行（Deutsche Bank）估计这一比例高达 60%。

这些进一步资本支出的 _合理性证明_ ，在很大程度上是由 OpenAI 和 Anthropic 驱动的，而 _它们_ 的需求又在很大程度上由那些补贴其用户 AI 代币的亏损 AI 初创公司驱动。

尽管英伟达可以大谈我们如何 “实现了 AGI” 或存在 “疯狂的需求”，但 _购买英伟达 GPU_ 的实际 _财务回报_ 几乎完全由 OpenAI 和 Anthropic 驱动，我的意思是微软、谷歌、亚马逊、甲骨文、CoreWeave、Lambda、Hut8、Fluidstack 以及几乎所有其他交易对手建设算力设施，要么主要、要么完全是为了获取 _来自这两家公司_ 的收入。

[我能找到的最佳例子是 SB Energy](https://www.wheresyoured.at/premium-the-haters-guide-to-circular-financing-part-two/#what-is-sb-energy:~:text=Well%2C%20let%E2%80%99s%20not%20get%20too%20worried.%20Perhaps%20SB%20Energy%20has%20other%20data%20center%20capacity%20somewhere%3F%20No%2C%20no%2C%20that%E2%80%99d%20show%20up%20there.%20Maybe%20it%20will%E2%80%A6make%E2%80%A6money%20elsewhere%3F%20Somehow%3F%20I%20hear%20it%20has%20a%20%24439%20billion%20backlog%2C%20it%E2%80%99s%20gotta%20make%20that%20money%20at%20some%20point%2C%20right%3F) ，该公司拥有 4390 亿美元的积压订单，其中 99.4% 专门留给了 OpenAI。

除了 OpenAI 和 Anthropic 之外，英伟达 GPU 的进一步销售完全依赖于 [英伟达的预期管理](https://www.wheresyoured.at/hyperscale-normalization/#the-ai-bubble-%E2%80%94-and-circular-financing-%E2%80%94-is-all-about-perception-management) ，让所有人继续相信对 AI 算力存在真实的需求，这也是它 [变相收购 Poolside](https://www.wsj.com/tech/ai/nvidia-is-spending-6-billion-to-build-a-powerful-u-s-alternative-to-chinese-ai-c51c38cc?ref=wheresyoured.at) 并可能向 [Perplexity](https://www.theinformation.com/articles/nvidia-discusses-perplexity-investment-30-billion-plus-valuation-considered-tech-licensing-deal?ref=wheresyoured.at) 和 [Thinking Machines](https://finance.yahoo.com/technology/ai/articles/thinking-machines-lab-seeks-40b-022414055.html?ref=wheresyoured.at) 投资数十亿美元的原因。如果没有风险投资（或英伟达）的资金，这两家公司实际上都无法生存，但有了英伟达的投资，它们有可能为超大规模服务商或新兴云服务商的积压订单再添数亿或数十亿美元的 “需求”。

再次强调，_每个人都认为一切安好，因为资金尚未耗尽_ ，并且因为 [英伟达承诺在 2028 财年实现 70% 的同比增长](https://www.reuters.com/business/media-telecom/nvidia-forecasts-quarterly-revenue-above-estimates-2026-08-26/?ref=wheresyoured.at) 。新兴云服务商以及像 SB Energy 这样几乎不存在的数据中心开发商（[当然由英伟达提供担保](https://www.cnbc.com/2026/08/17/nvidia-financing-open-ai-data-center-ohio.html?ref=wheresyoured.at) ）依然能够获得数据中心债务融资，这主要是因为英伟达自身参与制造的 “对 AI 算力的庞大需求” 假象。

从根本上说，英伟达的收入取决于超大规模服务商能否继续从 OpenAI 和 Anthropic 获得付款，因为只有这两家公司才有可能为它们超过万亿美元的资本支出提供合理化借口。正如我已经指出的，[彭博社报道称](https://www.bloomberg.com/news/articles/2026-08-05/microsoft-s-ai-sales-mostly-come-from-openai-disclosures-show?ref=wheresyoured.at) ，在微软 2026 财年 333.3 亿美元的 AI 收入中，只有约 100 亿美元来自向其客户销售算力或 AI 驱动的软件——这个微不足道的数额表明，一旦剥离掉它那个不可持续的败家子，实际的 AI 需求极其匮乏。

博通在试图与英伟达竞争的过程中，决定自己也需要承担一点集中度风险，[根据其最新财报](https://finance.yahoo.com/technology/ai/articles/ai-revenue-set-surge-400-174500769.html?ref=wheresyoured.at) ，Anthropic 和 OpenAI 将在其下一个财年成为其第一大和第二大客户。

与超大规模服务商类似，博通和英伟达都不会因为 AI 泡沫破裂而破产，但博通未来的收入——在 2028 财年（始于 2027 年 11 月）估计为 2300 亿美元——现在不仅依赖于 _来自超大规模服务商的直接采购（由 Anthropic 和 OpenAI 支撑其合理性），还依赖于 AI 实验室本身_ ，这不知何故反而创造了更大的底层风险敞口。

### 只要资金还在流动，一切看似安好

无论你对我或整个 AI 泡沫持何种看法，都无法改变这样一个事实：在某家公司因无法筹集到资金而未能向新兴云服务商、超大规模服务商或 AI 实验室付款之前，一切都会显得毫无问题。

为了让这个飞轮继续转动，AI 初创公司必须能够每隔几个月就筹集到数亿美元，同时 Anthropic 和 OpenAI 必须继续筹集数百亿（甚至数千亿）美元来向超大规模服务商支付算力费用，以便后者除了筹集数千亿美元外，还能把这些钱花在英伟达的 GPU 上，而英伟达只有在能够为贷方继续发放数千亿美元债务提供依据、或为这些债务所投建的数据中心提供兜底担保的前提下，才能继续每年赚取数千亿美元。

换句话说，AI 泡沫完全建立在大概几百家公司把钱花在两家公司身上、以证明五家公司把钱花在一家公司身上的意愿之上。如果你算上博通的话那就是两家公司，不想算也可以不算。

如果你把这些告诉大多数记者或投资者，他们会让你别操心。正如 The Information 所报道的那样：

> 但投资者可能需要降低他们的预期。一位大型公开市场投资者总结 Anthropic 应对市场的策略为：“别想太复杂。只要看收入增长率就行了。那是你唯一需要知道的。”

任何告诉你对一家每年亏损数十亿美元、背负 5170 亿美元算力承诺的公司 “不要担心” 的人都是骗子，而任何在刊发这种言论时不加任何评论指出其 _极度令人担忧_ 的人，根本不在乎你的死活。

但这确实就是科技行业的现状：一个痴迷于增长的狂热邪教，被一个同样痴迷于衡量和赞美其增长规模及未来前景的媒体生态所赋能，而一切始终是在由权贵设定的语境下被包装和呈现。

双方都未能在这一时刻保持清醒和目标感，这将导致一场规模可能令互联网泡沫相形见绌的市场回调，让卷入其中的许多人原形毕露——沦为骗子、造假者、低能儿、食尸鬼、懦夫，或是彻头彻尾、不可理喻的无知之徒。
