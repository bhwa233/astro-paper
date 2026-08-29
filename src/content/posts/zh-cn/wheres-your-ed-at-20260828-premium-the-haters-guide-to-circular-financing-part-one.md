---
author: bhwa233
pubDatetime: 2026-08-28T15:55:36.000Z
modDatetime: 2026-08-29T07:10:01.035Z
title: "唱衰者指南：英伟达循环融资迷局（上）"
featured: false
draft: false
tags:
  - 阅读
  - "Where's Your Ed At"
description: "作者质疑英伟达循环融资运作模式"
timezone: Asia/Shanghai
source:
  title: "Premium: The Hater's Guide To Circular Financing (Part One)"
  author: "Ed Zitron"
  publication: "Where's Your Ed At"
  url: "https://www.wheresyoured.at/premium-the-haters-guide-to-circular-financing-part-one"
  publishedAt: 2026-08-28T15:55:36.000Z
translation:
  language: zh-CN
  model: "gemini-3.7-flash"
  promptVersion: substack-translation-v3
  translatedAt: 2026-08-29T07:10:01.035Z
  authorized: false
---

> 原文：[Premium: The Hater's Guide To Circular Financing (Part One)](https://www.wheresyoured.at/premium-the-haters-guide-to-circular-financing-part-one)
> 原作者：Ed Zitron · Where's Your Ed At · 2026-08-28
> 中文翻译；版权归原作者所有。

_［英伟达员工大会，现时，背景音乐响着《YMCA》］_

**黄仁勋：** 我们 _爱_ 英伟达，大家说对不对？我们是最大、最漂亮的半导体公司，我们为 [_冷汗萨姆_](https://www.wheresyoured.at/hatersguide-openai/) 和 [_瓦里奥·阿莫代_](https://www.wheresyoured.at/premium-the-haters-guide-to-anthropic/) 那些庞大而美丽的 AI 实验室制造最大、最强劲的 GPU，_但他们买不起，因为他们亏得太厉害了！_ ［观众嘘声］

_没关系！没关系！_ 那些高大强壮的男人们，肌肉最发达的，像萨蒂亚·纳德拉（Satya Nadella）这样高大、英俊、强壮的男人们正在给我打电话，_苦苦哀求_ ——他们在哀求，你们敢信吗？——他们求我：“先生，先生，求求你给我发批 [Vera Rubin](<https://en.wikipedia.org/wiki/Rubin_(microarchitecture)?ref=wheresyoured.at>) 吧，先生！我怎么买都买不够！” ［观众叫嚷］他们买不够 Vera Rubin！他们求我把 Vera 送过去！Vera！Vera 在哪儿呢？［扫视人群］把她叫上台来！不，不，别这么做，她太害羞了！

我们也爱 Grace，_［声音转为低沉沙哑］_ [_Grace Blackwell_](https://www.nvidia.com/en-us/data-center/gb200-nvl72/?ref=wheresyoured.at)，多棒的姑娘啊！我告诉他们所有人，[到 2027 年底我们将交付出价值 _一万亿_ 美元的 _Grace Blackwell_ 和 _Vera Rubin_](https://www.wsj.com/tech/ai/nvidias-ceo-projects-1-trillion-in-ai-chip-sales-as-new-computing-era-begins-671b369d?ref=wheresyoured.at)，我们漂亮的姑娘 _Grace_ 和 _Vera_，她们是我们迄今为止最大、最贵的姑娘，我们的 _G-P-U_。媒体说“我们不信你，先生！”但 _我要让所有人都买，见鬼，我甚至会给他们钱去买，_[_就像我对 CoreWeave 做的那样_](https://www.wheresyoured.at/dont-look-up/#:~:text=good%20friend%20and-,collaborator,-%2C%20would%20sign)_，然后我会去告诉冷汗萨姆，说：“萨缪尔，_[_像你给迈克尔·英特拉托（Michael Intrator）那样，也给他们投几十亿_](https://www.coreweave.com/news/coreweave-expands-agreement-with-openai-by-up-to-6-5b?ref=wheresyoured.at)_”，他就会说“遵命，先生！”_

现在，有人对我说——“先生！先生！您的客户买不起您的半导体！先生，它们太贵了！”而我说 _它们还不够贵！_[_我们要再涨价 17%！_](https://www.theinformation.com/articles/nvidia-ai-chip-prices-rise-17-server-makers-tell-customers?rc=kz8jh3&ref=wheresyoured.at) _［观众叫嚷］我们要涨价吗？我们要这么做吗？我们就是要这么干！_

在我脑海中，黄仁勋就是这样对手下员工训话的。得益于英伟达惊人的股价涨幅，[公司超过 70% 的员工都成了百万富翁](https://finance.yahoo.com/news/nvidia-producing-unprecedented-wealth-employees-003124691.html?guccounter=1&guce_referrer=aHR0cHM6Ly93d3cuZ29vZ2xlLmNvbS8&guce_referrer_sig=AQAAAMciMInrSIxqCPfP2uO-nxfeYtkCrgVlisZDOe7bsA4YKHxrHdWt33COcj8PjaeChlOL01B6JDzPz3Vf1PlZPFdSJSlMmsOphxsSGCDI1LnwGTMnYFQxajAnbp1GSYQ3PwQfUrWz62Ax5UrBJnisH2fiB5tiEy25XR00AXIwaIgd&ref=wheresyoured.at)；据内部人士透露，员工对股价变动产生了一种近乎癫狂的关注。我能想象在那里工作一定感觉有点疯癫。

假设你在 2024 年股价出现抛物线式飙升之前入职，你就会看到自己的限制性股票（RSU）在短短几年内暴涨了 10 倍，而这一切全都建立在所有人都在大谈 AI 有多么 _庞大_、多么 _宏伟_ 的基础之上……

……_与此同时，一个事实变得昭然若揭：英伟达的最大客户们，在很大程度上正是由英伟达自己出资支持的_。

尽管表面上英伟达仍在销售 AI GPU 以外的产品（比如 [自动驾驶汽车](https://www.nvidia.com/en-us/solutions/autonomous-vehicles/?ref=wheresyoured.at)、笔记本显卡以及 [机器人仿真技术](https://www.nvidia.com/en-us/omniverse/?ref=wheresyoured.at)），但其 90% 以上的收入都来自数据中心硬件。因此，这家公司的估值逻辑几乎完全取决于它能否不断为其最大客户每季度挥霍数百亿美元找到合理的借口。

否则，英伟达为何要费尽心机打造一个 [英伟达品牌的 Openclaw](https://www.cnbc.com/2026/03/10/nvidia-open-source-ai-agent-platform-nemoclaw-wired-agentic-tools-openclaw-clawdbot-moltbot.html?ref=wheresyoured.at)，或者 [构建一个让大语言模型执行“智能体（agentic）”任务的平台](https://nvidianews.nvidia.com/news/ai-agents?ref=wheresyoured.at)，又或者 [向 Poolside 砸下 60 亿美元（同时另行投资 10 亿美元）](https://www.wsj.com/tech/ai/nvidia-is-spending-6-billion-to-build-a-powerful-u-s-alternative-to-chinese-ai-c51c38cc?ref=wheresyoured.at) 并挖走其大部分员工？否则，它又为何计划 [以介于“蠢到家”与“可笑”之间的 300 亿美元估值向 Perplexity 投资数十亿美元](https://www.theinformation.com/articles/nvidia-discusses-perplexity-investment-30-billion-plus-valuation-considered-tech-licensing-deal?rc=kz8jh3&ref=wheresyoured.at) 呢？

抱歉，我把话说得有点含糊了。英伟达在过去三年里所做的一切，归根结底只为了两件事：

- 为其 AI GPU 及相关硬件创造销售额。
- 为其客户创造对 AI 算力的需求。

英伟达在达成第一个目标上取得了成功，主要是通过将这些 GPU 出售给亚马逊、谷歌、微软、甲骨文和 Meta 等超大规模云厂商（hyperscalers）。根据不同分析师的说法，这些公司占了其 GPU 销量的 50% 到 60% 左右。

其余部分则来自不知名的“主权 AI 客户”与“新型云（neoclouds）”的混合体——后者的存在就是为了举债、购买英伟达 GPU，并将它们放置在数据中心出租给理论上的 AI 客户。根据美国银行（Bank of America）的维韦克·阿里亚（Vivek Arya）在 6 月美银全球技术大会上的说法，面向“新型云/主权/本地部署”的销售额与面向超大规模云厂商的销售额大致相当。虽然人们很容易在这里含糊其辞地说“可能会有大规模的主权算力建设！”，但我找不到令人信服的证据证明这些实际存在，[除了软银声称在法国对 AI 基础设施进行理论上的 750 亿欧元投资](https://www.cnbc.com/2026/05/31/softbank-to-build-up-ai-data-centers-in-france-with-major-investment.html?ref=wheresyoured.at)——而软银根本没有那么多钱可花。

无论如何，英伟达的整个战略已经演变成一种非此即彼的模式：要么说服全球最大的企业每年向黄仁勋双手奉上 1000 亿美元，要么通过循环融资人为推高其营收——这显然就是我今天所要讨论的内容。

这是我的《唱衰者循环融资指南》的第一部分，全面分析了英伟达庞大循环融资运作的现状、为何它至今尚未破裂、其局限性，以及在最新季度财报中暴露出的实质性担忧。

第二部分将于下周发布，届时将涵盖循环融资的历史、我们此前在哪里见过这种模式，以及我们能从其可怕的过去中吸取什么教训。
