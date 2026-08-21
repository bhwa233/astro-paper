---
author: bhwa233
pubDatetime: 2026-07-30T12:04:25.000Z
modDatetime: 2026-08-21T06:49:02.072Z
title: "为什么大家都在争相研发固态电池？｜Construction Physics"
featured: false
draft: false
tags:
  - 海外长文
  - "Construction Physics"
description: "本文从化学反应与势阱的基本物理机制切入，阐明了锂电池的工作原理，并对比解释了锂电池能量密度远逊于汽油的深层原因——承载反应所需的庞大“材料支架”。随后，文章剖析了锂枝晶带来的安全挑战，展示了固态电解质与金属锂负极如何通过大幅削减多余结构，实现兼具更高安全性与能量密度的电池构想。"
timezone: Asia/Shanghai
source:
  title: "Why Is Everyone Trying to Build a Solid-State Battery?"
  author: "Brian Potter"
  publication: "Construction Physics"
  url: "https://www.construction-physics.com/p/why-is-everyone-trying-to-build-a"
  publishedAt: 2026-07-30T12:04:25.000Z
translation:
  language: zh-CN
  model: "gemini-3.7-flash"
  promptVersion: substack-translation-v1
  translatedAt: 2026-08-21T06:49:02.072Z
  authorized: false
---

> 原文：[Why Is Everyone Trying to Build a Solid-State Battery?](https://www.construction-physics.com/p/why-is-everyone-trying-to-build-a)
> 原作者：Brian Potter · Construction Physics · 2026-07-30
> 中文翻译；版权归原作者所有。

一种备受关注的电池技术是固态电池（solid-state batteries），即用固态材料替代液体电解质的锂离子电池。截至2024年，仅中国电池制造商宁德时代（CATL）就有超过 [1,000 人](https://cnevpost.com/2024/11/06/catl-solid-state-batteries-begin-sample-validation-report/) 投身于固态电池研究，而像[比亚迪（BYD）](https://electrek.co/2026/06/01/byd-all-solid-state-batteries-evs-by-2027/)、[LG](https://blog.lgchem.com/en/2026/03/25_solid_state_battery/) 和[三星（Samsung）](https://www.samsungsdi.com/sdi-now/sdi-news/4782.html) 等电池制造商也在研发这项技术。[截至 2025 年](https://www.electronicsweekly.com/news/business/solid-state-ev-battery-start-ups-in-sample-mode-2025-03/)，研发固态电池的欧美初创企业总共筹集了超过 40 亿美元的资金。

与我们目前使用的液态电解质锂离子电池相比，固态电池具有几个潜在优势。首先，用固态物质替代液态电解质有望使电池更轻，每输出单位能量所需的质量更少。其次，由于电池中目前使用的液态电解质易燃，将其换成固态材料可以使电池更安全，不易发生火灾。

我想更深入地了解：与传统锂离子电池相比，固态电池究竟为何具备这些优势，以及它们在锂电池演进的长远发展脉络中占据怎样的位置。

#### 电池基础知识

电池通过化学反应提供能量。而无论涉及何种化学物质，化学反应释放或吸收能量的机制都是相同的：一个或多个电子从一个势能阱（potential energy well，简称势阱）移动到另一个势能阱。在释放能量的化学反应（放热反应）中，电子从较高的势阱移动到较低的势阱，并在过程中释放出能量。

“势阱”这个概念相当抽象，因此我认为用重力作类比很有帮助。假设一个球位于高山顶部的浅凹槽中，而山脚下还有另一个浅凹槽。球受到重力向下的拉力，这赋予了它势能——该势能取决于球的质量大小以及它距离山底的高度。单凭自身，山顶上的球不会移动，但如果你稍微推它一下，把它推出凹槽，它就会向山下滚去，在这个过程中释放其势能。这种势能转化为动能（球的速度），动能又通过摩擦力转化为热能，使球减速，直至停在下方的凹槽中。

化学反应的运作方式有些类似。但这里的势能并非来自重力，而是来自电磁力：带正电的原子核对带负电的电子产生吸引力。在放热反应中，原子始于某个特定的“凹槽”，其电子处于某种特定的排布方式。但如果你稍微给这些原子一个外力推动（例如，通过加热使它们的碰撞更加剧烈），你就能将它们撞出原有的凹槽，让它们“滚下山坡”，进入能量更低的构型，在此过程中转化其电势能。这些势能中的一部分（[实际上是一半](https://en.wikipedia.org/wiki/Virial_theorem)）将用于增加电子的速度；其余部分则以振动（热量）或光子的形式释放出来。

举例来说，假设你从一个甲烷分子（一个碳原子和四个氢原子，CH4）和两个氧分子（每个由两个氧原子组成，O2）开始。这些分子一开始其电子处于特定构型，氧原子彼此键合，氢原子与碳键合。在室温下，O2 和 CH4 大体上不会相互反应：各自处于需要能量才能脱离的自身势阱中。但是通过加热给它们一个推力，它们就能“滚下山坡”，经历一系列反应，最终进入能量更低的构型——氢原子和碳原子分别与氧键合，生成 H2O 和 CO2。由此产生的电子构型处于更低的势阱中，其中的大部分能量差以热量形式释放。

不足为奇，锂离子电池是通过利用与锂相关的化学反应来工作的。当锂离子电池放电时，锂离子及其电子“滚下山坡”，从负极的一种构型（嵌入石墨层之间，被称为“插层/嵌锂”）移动到正极能量更低的另一种构型（嵌入另一种材料中，例如磷酸铁锂，LiFePO4）。电池的结构设计旨在从该反应中捕获能量。锂离子可以通过负极进入电解质，但电子不行：它们必须绕道而行，穿过连接负极和正极的金属导体。这种电子的流动就是电池产生的电流。（当电池充电时，情况正好相反：施加在导体上的电压迫使电子逆流而上回到负极，同时锂离子流回电解质以保持电荷平衡。）[1](https://www.construction-physics.com/p/why-is-everyone-trying-to-build-a#footnote-1)

[![](/images/substack/construction-physics/253f70cdbab34718028d.jpg)](https://substackcdn.com/image/fetch/$s_!vKRJ!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F4e900154-ac91-4154-91fc-f48e8327a902_850x663.png)

锂离子电池示意图，来自[链接](https://www.researchgate.net/figure/The-principle-of-the-lithium-ion-battery-LiB-showing-the-intercalation-of-lithium-ions_fig1_344448023)。

锂是电池的首选材料，因为与合适的反应物配对时，电子脱离锂原子所经历的“能量落差”比脱离任何其他金属都要大。锂也是一种非常轻的原子（原子量约为 7），加之巨大的“落差”，意味着锂反应能产生极高的能量。单位质量下，锂反应释放的能量大约与燃烧汽油相当。

但如果真是这样，为什么锂离子电池的能量密度远低于汽油呢？

[![](/images/substack/construction-physics/d249b16fcb1313c8f8ca.png)](https://substackcdn.com/image/fetch/$s_!mjvP!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F56d57314-dd6d-41df-9287-286251a8dbde_1143x704.png)

各类电池和燃料的能量密度，来自 [Wikipedia](https://en.wikipedia.org/wiki/Energy_density)。

一个重要原因是氧化剂。我们赖以获取能量的化学反应通常需要一个供电子最终到达的“下坡目的地”，这被称为氧化剂。在燃烧汽油时，氧化剂是周围空气中的氧气：在汽油发动机内部，燃料和空气混合后被点燃，引发驱动发动机的化学反应——即爆炸。换句话说，燃油汽车不需要随身携带氧化剂，因为周围环境中随时都有现成的。

然而，锂离子电池就没有这么幸运了。它们需要以正极的形式随身携带电子的归宿。与燃油车所需承载的重量相比，这增加了大量的额外质量。如果一辆汽车需要随身携带自身的氧化剂，那么每 1 千克汽油就需要大约 3.5 千克的氧气。

更广泛地说，为了构建锂反应体系并以电流形式从中提取能量，需要大量的材料支架。在负极，每个锂离子需要额外的六个碳原子，形成供锂离子安顿其中的石墨层。正极也需要类似的嵌锂结构。除此之外，还有电解质、隔膜、集流体等带来的额外质量。截至 2019 年，电池中每反应 1 克锂，大约需要 70 克支撑材料（尽管自那时以来该数字可能有所下降）。

如果没有这些材料支架，反应仍然可以发生，但将是以一种无用的方式进行。如果某种因素在正负极之间建立了直接通道，反应将几乎瞬间完成，产生大量热量并引发其他化学反应从而摧毁电池，却不会产生任何有用的电流。事实上，现代电池设计花费了大量精力来防止这些失控反应的发生。

当然，所有这些材料支架的好处在于，你可以一次又一次地将相同的化学物质用于反应。现代锂离子电池上的嵌锂电极尤其擅长这一点；由于电极结构在电池充放电时得以维持，锂离子电池可以经历极多次循环，同时仍保留其大部分容量。而在燃烧汽油时，你是在不断排放反应产物（这当然正是我们最初想要摆脱化石燃料、阻止排放的 CO2 在大气中积聚的全部原因）。理论上，你可以通过制造某种基于锂的内燃机来弃用锂离子电池的支架，但这将运作得极其糟糕，而且运行成本极其昂贵（尽管有些人对利用空气中的氧气作为电池氧化剂的[锂空气电池](https://en.wikipedia.org/wiki/Lithium%E2%80%93air_battery)很感兴趣）。

#### 固态电池的前景

固态电池的主要潜在好处在于大幅削减这种材料支架。

当前锂离子电池的一个棘手问题是枝晶（dendrites）。正如我们所指出的，在负极，锂离子安置在石墨层之间。但负极对锂离子的束缚非常弱，仅略好于金属锂本身的结合力。这很有用，因为离子可以轻易迁移到电解质中，从而使电池得以工作，但这同时也是一把双刃剑：在特定条件下，充电时本应进入负极的锂离子可能会在负极表面获得电子，形成称为枝晶的树状金属锂结构，而不是嵌入石墨层之间。如果枝晶刺破正负极之间的隔膜，就会在两者之间建立直接通道，导致电池设计所极力防止的失控反应发生。（这不会立即让电池中的所有锂都参与反应——随着电流流过枝晶，枝晶会升温，最终熔化并断开通路——但短暂反应产生的热量可能足以触发其他化学反应，导致热失控并彻底损坏电池。）大量的电池开发工作都致力于防止这些枝晶的形成。

[![](/images/substack/construction-physics/8569721a7d5f2a6bf302.png)](https://substackcdn.com/image/fetch/$s_!Fy29!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F0dfa2dd2-1c76-45f2-8618-b2ff6c8f97c2_250x176.png)

枝晶生长，来自 [Wikipedia](https://en.wikipedia.org/wiki/Solid-state_battery)。

然而，如果将液体电解质替换为某种固体材料，这些枝晶可能就不再是问题了。[2](https://www.construction-physics.com/p/why-is-everyone-trying-to-build-a#footnote-2) 有了坚固的固态电解质，枝晶（理论上）将无法穿透它，尽管在当前的固态电解质中，枝晶似乎仍然能找到穿透的路径。如果枝晶的风险被消除，你就可以换用不同的负极，完全摒弃石墨嵌锂结构，转而使用纯金属锂作为负极。[3](https://www.construction-physics.com/p/why-is-everyone-trying-to-build-a#footnote-3) 而且由于固态材料消除了易燃电解质，所制得的电池也可能会更安全。

固态电池可能不会很快普及——宁德时代董事长在技术成熟度等级上[将其评为 4 级（共 9 级）](https://electrek.co/2026/06/25/catl-solid-state-battery-level-4-2030/)，并指出商业可行性“尚未确立”。但人们对其“[可能]更安全、能量密度更高，并且最终可能比今天的电池更便宜”的[预期](https://www.pnas.org/doi/10.1073/pnas.2425219121)，正在推动世界各地的制造商努力将其变为现实。

_感谢 Austin Vernon 阅读本文草稿。文责自负。_

[1](https://www.construction-physics.com/p/why-is-everyone-trying-to-build-a#footnote-anchor-1)

电子在放电期间发生迁移的原因较为复杂。在负极，锂离子迁移到电解质中，因为电解质是一个更具吸引力、处于更低势能阱的位置。在正极，情况正好相反；锂离子从电解质迁移到正极中。在每个电极处，这都会产生净电荷并生成电场，从而阻止进一步的迁移。但是，由于负极界面处现在具有净负电荷（因为带正电的锂离子已离开），而正极界面处具有净正电荷（因为带正电的锂离子已进入），当两者通过导体连接时，电子会在两极之间流动以平衡电荷。然而，由于每个到达的电子都与一个到达的锂离子相配对，正负极之间的电荷差并没有被彻底中和平衡，从而使电流能够持续流动，直到正极没有多余空间容纳锂离子或负极不再有锂离子剩下为止（不过大多数电池都设有截止机制，当电压降至某一水平以下时会停止电流流动）。

[2](https://www.construction-physics.com/p/why-is-everyone-trying-to-build-a#footnote-anchor-2)

在晶体固态电解质中，锂离子通过从固态晶格中的一个空位跳跃到下一个空位来实现迁移。由于热能的作用，离子每秒来回振动数万亿次，有时某次振动会具备足够的能量且方向合适，从而挤过周围的原子进入附近的空位。

[3](https://www.construction-physics.com/p/why-is-everyone-trying-to-build-a#footnote-anchor-3)

20 世纪 80 年代的一家名为 Moli Energy 的公司曾尝试制造使用金属锂负极的锂电池，但由于枝晶问题导致电池起火，在经历了一次[大规模召回](https://electricautonomy.ca/ev-supply-chain/batteries/2020-09-18/moli-energy-lithium-battery-technology/)后放弃了该方案。
