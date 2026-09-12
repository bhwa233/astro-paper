---
author: bhwa233
pubDatetime: 2026-09-11T14:05:01.000Z
modDatetime: 2026-09-12T04:42:19.890Z
title: "博通黑粉指南"
featured: false
draft: false
tags:
  - 阅读
  - "Where's Your Ed At"
description: "作者质疑博通依赖并购与AI芯片的增长模式"
timezone: Asia/Shanghai
source:
  title: "Premium: The Hater's Guide To Broadcom"
  author: "Ed Zitron"
  publication: "Where's Your Ed At"
  url: "https://www.wheresyoured.at/premium-the-haters-guide-to-broadcom"
  publishedAt: 2026-09-11T14:05:01.000Z
translation:
  language: zh-CN
  model: "gemini-3.7-flash"
  promptVersion: substack-translation-v3
  translatedAt: 2026-09-12T04:42:19.890Z
  authorized: false
---

> 原文：[Premium: The Hater's Guide To Broadcom](https://www.wheresyoured.at/premium-the-haters-guide-to-broadcom)
> 原作者：Ed Zitron · Where's Your Ed At · 2026-09-11
> 中文翻译；版权归原作者所有。

据 [The Information](https://www.theinformation.com/articles/diamonds-turds-hock-tan-turned-broadcom-ai-juggernaut?rc=kz8jh3&ref=wheresyoured.at) 报道，2024 年初，博通（Broadcom）首席执行官陈福阳（Hock Tan）与 [刚被收购的 VMware](https://investors.broadcom.com/news-releases/news-release-details/broadcom-acquire-vmware-approximately-61-billion-cash-and-stock?ref=wheresyoured.at) 员工进行了一场“咖啡畅谈”，并向他们展示了他独特的管理风格：

> 当时，VMware 位于加州帕洛阿尔托的园区占地 100 英亩，分布着 18 栋建筑、修剪精致的花园、一个室外露天剧场和一个乌龟池。员工还享有丰厚的 HR 福利，包括育儿补贴、婚姻咨询，以及每年 1000 美元的“健康”津贴，可用于购买从哑铃到 Xbox 的任何物品。
>
> 当陈福阳开放提问环节时，一名 VMware 员工询问博通是否提供此类福利。陈福阳显得很惊讶。据在场的受访者称，他回答道：“我为什么要提供那些？我又不是你们的爹。”
>
> 在接下来的几个月里，陈福阳解雇了 VMware 3.8 万名员工中的约一半。他还对园区进行了精简，卖掉了除五栋建筑外的所有房产。在保留的办公室里，陈福阳让人搬走了浓缩咖啡机。有些出乎意料的是，乌龟被允许留了下来。

他也许不是你爹，但陈福阳绝对是个混蛋。

博通这家公司为人所熟知，很可能是因为其 XPU 平台——该平台集成了各种不同的知识产权和半导体组件获取渠道，使其能够构建定制 AI 芯片，其中最著名的当属 [谷歌的 TPU](https://cloud.google.com/tpu?hl=en&ref=wheresyoured.at)。它 [刚刚与苹果签署了一项价值 300 亿美元的协议，为其打造“定制 ASIC 芯片产品”](https://www.cnbc.com/2026/07/08/apple-commits-30-billion-to-broadcom-for-us-chipmaking-push.html?ref=wheresyoured.at)。

苹果此前就已经是博通的大客户。历史上，博通为 iPhone 和苹果其他设备提供了很大一部分无线和射频组件，曾一度占博通营收的 20% 以上，后来随着 AI 芯片销售增长以及对 VMware 的收购，这一比例降至约 10% 到 15%。

在很大程度上，博通的业务建立在向各大公司出售其硬件内部组件或外围硬件组件的基础上——从无线和射频组件到数据中心网络工具，无所不包。

它还涉足大型机软件（源自 [对 CA Technologies 的收购](https://investors.broadcom.com/news-releases/news-release-details/broadcom-inc-completes-acquisition-ca-technologies?ref=wheresyoured.at)）、安全软件（源自 [对赛门铁克企业安全业务的收购](https://investors.broadcom.com/news-releases/news-release-details/broadcom-acquire-symantec-enterprise-security-business-107?ref=wheresyoured.at)）和虚拟化软件（源自对 VMware 的收购），这些收购耗费了它总计 991 亿美元的现金和股票（未计入通胀因素）。

然而，“博通”作为一家公司，并不总是叫博通，也不是由陈福阳创立的。正如我将在本文中探讨的那样，“博通”曾经是两家截然不同的公司——一家是成立于 1998 年、名为“博通”（Broadcom）的无线通信芯片公司，另一家是由惠普分拆出来的半导体子公司演变而来、由私募股权打造的庞然大物，名为“安华高科技”（Avago Technologies）。

> **旁注：** 这就是为什么博通的股票代码是“AVGO”。

[就像甲骨文（Oracle）一样](https://www.wheresyoured.at/premium-the-haters-guide-to-oracle-part-2/)，博通的故事也是一个公司不断收购其他公司，然后在追求无休止增长的过程中坑害客户和员工的故事，其手段通常包括哄抬价格、大规模裁员以及削减任何无法提升利润率的成本。

《华尔街日报》2018 年 1 月关于博通 [耗资 1170 亿美元收购高通未果](https://www.reuters.com/article/markets/asia/timeline-broadcom-qualcomm-saga-comes-to-an-abrupt-end-idUSKCN1GQ22N/?ref=wheresyoured.at) 的报道就是一个极好的例子：

> 中国手机制造商 OPPO 和 vivo 的高管最近表示担心，博通可能会削减高通在基础蜂窝技术方面的研发支出。一位 vivo 高管表示，博通的选择要么是提高高通的产品价格，要么是削减其成本，“无论哪种选择都会对我们不利。”
>
> 另一家手机制造商小米公司的战略合作高级副总裁王翔表示，他正在评估博通与高通合并的影响。他说：“我认为我们更关心技术合作伙伴是否有足够的动力进行技术创新。”

两个月后，尽管有十几家银行签署协议（[据路透社报道](https://www.reuters.com/article/markets/asia/timeline-broadcom-qualcomm-saga-comes-to-an-abrupt-end-idUSKCN1GQ22N/?ref=wheresyoured.at)）为博通提供 1000 亿美元过桥贷款以促成交易，该交易最终还是破裂了，[特朗普总统否决了这笔交易](https://www.investopedia.com/news/why-did-trump-block-broadcoms-bid-qualcomm/?ref=wheresyoured.at)，以防止博通（当时是一家总部位于新加坡的公司）控制总部位于美国的高通。客观地说，美国外资投资委员会（CFIUS）（[据《国会山报》报道](https://www.investopedia.com/news/why-did-trump-block-broadcoms-bid-qualcomm/?ref=wheresyoured.at)）“……担心博通的收购会导致该行业的研发投资下降，从而为中国企业在下一代无线技术开发中占据领先地位打开大门。”

研发方面的担忧是非常现实的。据《华尔街日报》报道：

> 根据博通、高通和标准普尔全球市场财智（S&P Global Market Intelligence）的数据，陈福阳在担任首席执行官的十几年里，在收购上的支出是在研发上支出的六倍，而在同一时期，高通在收购上的支出远低于研发。在过去的 12 个月里，博通将营收的 19% 用于研发，而高通的研发支出占营收的 25%。

嗤， _19%？_ 那根本不算什么。自收购 VMware 以来，博通研发预算占营收的比例一路下滑，在最近一个季度已萎缩至平平无奇的 9.8%。

![](/images/substack/wheres-your-ed-at/59cfc552254ca1320664.png)

按过去十二个月（TTM）计算，博通在研发投资占营收比例极低这一点上，在同类企业中尤为突出，仅“输”给英伟达（NVIDIA）——而英伟达的借口在于，它确实是美股市场上规模最大、盈利能力最强的公司。

![](/images/substack/wheres-your-ed-at/d69febdf24a88ad06fa5.png)

这是因为博通并不真正搞“创新”，也不在乎“善待客户”，而是通过囤积别人的专利、尽可能少地对其成果进行迭代，并让所有人不得不向陈福阳打钱。甚至连用于消除手机干扰的 FBAR 滤波器——[它与苹果交易的关键部分](https://www.apple.com/newsroom/2026/07/apple-to-increase-spend-with-broadcom-to-produce-billions-more-us-chips/?ref=wheresyoured.at)——也是安华高收购原博通得来的。

> **旁注**：我必须为高通收购案补充一些背景信息。当时，5G 推广在即，特朗普政府担心中国的华为最终会为下一代移动通信提供很大一部分基础设施，从而让中国对西方公司和政府的通信拥有前所未有的访问权限。
>
> 那时，移动基础设施领域只有三家真正的玩家——[华为、诺基亚和爱立信](https://www.americanprogress.org/article/solution-huawei-challenge/?ref=wheresyoured.at)。这三家剩下的残羹冷炙则被三星和另一家中国公司中兴通讯瓜分。
>
> 显然，手机终端所采用的技术（由高通提供）与移动基础设施之间存在差异——移动基础设施包括无线接入网（RAN，简而言之就是手机连接的无线天线）和核心网（负责路由通话并将设备连接到更广泛互联网的幕后技术）。
>
> 当时，中国在替代高通技术方面并没有真正可行的方案，唯一的例外（令人震惊的是）是华为，它制造了自己的 5G 基带，并将其塞入自研的麒麟芯片组中。但华为只为华为生产智能手机技术，中国的其他手机巨头（OPPO、小米、Realme 等）不得不从西方供应商那里购买技术。
>
> 尽管如此，关键在于，美国非常警惕在一个传统上由美国公司或其盟国公司主导的领域中让中国这样的对手占据优势。
>
> 爱立信是瑞典的。诺基亚是芬兰的。三星（虽然当时只是个小角色）是韩国的。
>
> 如果你好奇我们为什么最终形成了三寡头垄断，答案要么是因为构成移动网络的很多组件属于低利润率、高产量的行业（[像思科这样的公司对此并不特别上心](https://www.mobileworldlive.com/network-tech/cisco-says-no-to-ran/?ref=wheresyoured.at)），要么是因为相关公司破产了（如加拿大的北电网络），或者被更大的巨头兼并了（如英国的马可尼移动）。
>
> 不管怎样，事后回想起来，没有让博通把高通变成一个被剥离资产的僵尸化空壳，可能确实是个好主意。至少从担心虚构的中国假想敌的角度来看是如此。
>
> 最后一点：2025 年，华为 [将总营收的 21.8% 用于研发](https://www.huawei.com/en/ipr?ref=wheresyoured.at)——多年来它基本维持了这一水平，[尽管它在 2019 年遭到美国制裁，随后被切断了所有源自美国的技术获取渠道](https://2017-2021.commerce.gov/news/press-releases/2019/05/department-commerce-announces-addition-huawei-technologies-co-ltd.html?ref=wheresyoured.at)；这也是为什么它能够做出一些真正有趣的东西，尤其是在移动和汽车领域。

一两年前，这篇文章本可以叫作 _安华高黑粉指南_，因为这才是博通真正的故事——一家新加坡半导体公司，借着别人打响的名号，将其他公司的技术整合到自己旗下。

据《华尔街日报》在 [其收购博通前几个月](https://www.wsj.com/articles/BL-MBB-37230?ref=wheresyoured.at) 报道：

> 如果安华高完成这笔交易，这将是一连串收购中规模最大的一笔。在过去的六年中，该公司通过激进的并购交易提升了市值和股价，每一步都得到了投资者的奖赏。
>
> 其最近的一笔交易是在 2 月底，安华高宣布以约 6.06 亿美元收购网络公司 Emulex。公告发布后的第一个交易日，安华高的股价跃升了近 15%，市值增加了约 42 亿美元。
>
> 它是过去两年中半导体行业最具侵略性的收购者之一。自 2013 年以来，它在美国收购了五家公司，估值约 80 亿美元，其中包括以 66 亿美元收购竞争对手 LSI。然而在此期间，其市值同期增长了超过 250 亿美元。今年，安华高的股价已上涨了 40% 以上。

[就像甲骨文一样](https://www.wheresyoured.at/premium-the-haters-guide-to-oracle-part-2/#:~:text=actually%20boosted%20revenues.-,Adjusted,-for%20inflation%2C%20Oracle%E2%80%99s)，博通把并购作为在营收上维持现状的手段，除了收购 VMware 之外，每一次并购对其整体发展轨迹的影响都微乎其微。

然而，博通通过整合对 LSI（几年前与杰尔系统 Agere 合并）的收购以及自身的半导体实力，在幕后悄悄布局了一件事——与谷歌建立起初步的合作关系，为其制造张量处理器（TPU）。这些 AI 芯片起初用于支持搜索和地图等产品，并最终成为 AI 热潮的重要组成部分。

需要明确的是，博通并没有“预见到未来的发展”，也没有“在 AI 热潮初期就精准捕捉到机会”。虽然它像玩《块魂》（Katamari Damacy）一样把各种不同的半导体公司滚到一起确实值得记上一笔，但这绝不是陈福阳或任何其他人拥有某种先见之明，为了期待巨额回报而提前投资 ASIC。

实际情况要简单得多：此前就已经依靠（非大语言模型的）AI 驱动各项服务的谷歌，找来博通，利用其堆积如山的各类专利和供应链关系拼凑出专用芯片。这些芯片起初只是为博通带来小幅的营收增长，直到 ChatGPT 的问世把桑达尔·皮查伊（Sundar Pichai）吓得将数十亿、继而是数百亿美元砸进一代又一代的 TPU 中。

到了 2024 财年，博通开始单独披露半导体解决方案部门的这部分收入，一件令人担忧的事情变得显而易见：它未来的几乎所有增长都已依赖于 AI 营收。

![](/images/substack/wheres-your-ed-at/28547aefa5c1537ac4cd.png)

从 2024 财年第一季度到 2026 财年第三季度，AI 营收在博通总营收中的占比从 19.2% 飙升至 56.4%，分析师预计在 2027 财年、2028 财年和 2029 财年，这一比例将分别达到 68.4%、79.8% 和 81.9%。

你 _绝对猜不到客户是谁！_

没错——就是 [OpenAI（为其定制 Jalapeno AI 芯片）和 Anthropic（购买谷歌 TPU）](https://financialpost.com/investing/broadcom-slides-ai-chip-forecast-underwhelms-investors?ref=wheresyoured.at)。它们将在 2027 财年成为博通最大的客户，这意味着数百亿（乃至最终数千亿）美元的营收将完全维系于两家不盈利、不可持续的 AI 公司是否付得起账单。

这是一个关于将他人创新拼凑在一起的大杂烩如何在短短三年内加速成为全球最大 AI 芯片制造商之一的故事，也是它对增长的极度渴望如何迫使其卷入最黑暗形式的循环融资的故事。

这就是《博通黑粉指南》——揭示陈福阳为击败英伟达、成为谷歌、Anthropic 和 OpenAI 首选芯片制造商而采取的激进策略背后的硬核数据与图表……以及一旦失败将面临何等巨大的风险。
