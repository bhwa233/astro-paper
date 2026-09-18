---
author: bhwa233
pubDatetime: 2026-09-17T12:02:08.000Z
modDatetime: 2026-09-18T04:52:12.057Z
title: "SpaceX 是如何精简猛禽发动机的"
featured: false
draft: false
tags:
  - 阅读
  - "Construction Physics"
description: "作者评估猛禽发动机的精简与迭代演进"
timezone: Asia/Shanghai
source:
  title: "How SpaceX Streamlined the Raptor Engine"
  author: "Brian Potter"
  publication: "Construction Physics"
  url: "https://www.construction-physics.com/p/how-spacex-streamlined-the-raptor"
  publishedAt: 2026-09-17T12:02:08.000Z
translation:
  language: zh-CN
  model: "gemini-3.7-flash"
  promptVersion: substack-translation-v3
  translatedAt: 2026-09-18T04:52:12.057Z
  authorized: false
---

> 原文：[How SpaceX Streamlined the Raptor Engine](https://www.construction-physics.com/p/how-spacex-streamlined-the-raptor)
> 原作者：Brian Potter · Construction Physics · 2026-09-17
> 中文翻译；版权归原作者所有。

![](/images/substack/construction-physics/e9653dc9b2476b005570.jpg)

来源：[SpaceX](https://x.com/SpaceX/status/1819772716339339664)。

如果你正在读这篇文章，你很可能见过这张展示 SpaceX 猛禽（Raptor）火箭发动机三代迭代版本的著名图片。猛禽发动机是专为 SpaceX 的星舰（Starship）航天器研发的（猎鹰 9 号和猎鹰重型使用的是 [梅林发动机（Merlin engine）](https://en.wikipedia.org/wiki/SpaceX_Merlin)）；它于 2016 年首次进行试车点火，2019 年在星虫（Starhopper）上完成首飞，2020 年首次在星舰原型机上飞行，并在 2023 年安装在完整星舰组合体上进行了试飞。自那时起，它便持续得到改进，从猛禽 1 号（Raptor 1）上可见的错综复杂的管道和线缆，演变为今年 5 月首次飞行的猛禽 3 号（Raptor 3）那平滑、流线型的设计。

这种演进是如此引人注目，以至于许多人起初甚至认为它不是真的；航天发射公司联合发射联盟（United Launch Alliance）当时的首席执行官托里·布鲁诺（Tory Bruno）曾 [发推文](https://www.nextbigfuture.com/2024/08/spacex-new-raptor-3-fires.html) 表示“没必要展示一台未组装完毕的发动机来夸大这一点”，随后 SpaceX 总裁格温·肖特韦尔（Gwynne Shotwell）发布了一张 [猛禽 3 号成功点火](https://x.com/Gwynne_Shotwell/status/1821674726885924923) 的照片作为回应：

![](/images/substack/construction-physics/e286eeeba8ca8eacf99d.jpg)

这种精简设计的同时还伴随着性能的显著提升，猛禽 3 号提供的推力比猛禽 1 号大约高出了 35%。

我想更好地了解这一演进究竟是如何发生的。具体而言，SpaceX 究竟做了哪些改变，才得以从左侧缠结的线缆与管道，变成右侧那台修长且流线型的发动机？

事实证明，能获取到的相关细节比我预想的要少。SpaceX 没有公开任何猛禽发动机的官方原理图，也没有人对猛禽发动机进行过拆解。但多亏了埃隆·马斯克（Elon Musk）偶尔的评论，以及庞大 SpaceX 粉丝群体的推测，我们能够大致了解其中的重大变化。

##### 猛禽发动机的工作原理

猛禽发动机是一款“全流量分级燃烧”（full-flow staged combustion, FFSC）发动机。这到底是什么意思？

火箭发动机的工作原理是将质量（“推进剂”）从火箭喷管向外喷射——根据牛顿第三定律（“相互作用的两个力大小相等，方向相反”），这会把火箭推向反方向。你喷射出的质量越多、喷射速度越快，火箭发动机产生的推力就越大。

实现这一点最简单的方法就是向储罐中充入加压气体，然后将部分气体向外排出。排出的气体会推动火箭前进，就像给气球放气会推动气球一样。这种被称为“冷气推进器”（cold gas thruster）的火箭，通常用于对航天器的位置或姿态进行微调。冷气推进器应用在 NASA 的载人机动装置（Manned Maneuvering Unit）以及 SpaceX 猎鹰 9 号火箭的姿控推进器等设备上。

![](/images/substack/construction-physics/8a975e0c5645b2f725da.jpg)

冷气推进器示意图，来源：[维基百科](https://en.wikipedia.org/wiki/Cold_gas_thruster)。

![](/images/substack/construction-physics/093a60728d3d36f34234.jpg)

载人机动装置，来源：[维基百科](https://en.wikipedia.org/wiki/Manned_Maneuvering_Unit)。

这些发动机结构简单且可靠，但也存在局限；你从冷气推进器中实际能获取的推力非常有限。那么我们怎样才能获得更大的推力呢？一个显而易见的方法是不使用单一推进剂，而是使用两种：取一种燃料（如煤油）和一种氧化剂（如液氧），然后让它们在燃烧室中一同燃烧，产生从火箭喷管后部喷出的高温气体。现在，我们不仅利用了储存在加压推进剂中的能量，还利用了储存在其化学键中的能量，并将该能量转化为推力。利用推进剂储罐的压力将燃料和氧化剂压入燃烧室的发动机被称为 [挤压循环发动机（pressure-fed engine）](https://en.wikipedia.org/wiki/Pressure-fed_engine)。阿波罗登月舱上升级所使用的发动机就是这种类型：它使用四氧化二氮（N2O4）作为氧化剂，使用一种名为混肼-50（Aerozine 50）的燃料，两者均经过加压。

![](/images/substack/construction-physics/afc543c9448aaa80eb99.jpg)

阿波罗登月舱上升段发动机，来源：[Engine History](https://www.enginehistory.org/Rockets/RPE09.44/RPE09.44.shtml)。

但这时你面临一个问题。为了防止燃烧室中燃烧的气体倒流回燃料和氧化剂管路（导致燃烧室缺少进入的推进剂），燃烧室中的压力必须 _低于_ 燃料和氧化剂储罐及管路中的压力。但是对于一台紧凑、强大的火箭发动机，我们希望燃烧室内拥有非常高的压力。我们可以通过增加推进剂储罐中的压力来解决这一问题，但这很快就会变得不切实际：压力越高，我们的储罐和推进剂管路就需要做得越厚、越重，以维持压力而不破裂。更好的解决方案是将推进剂储存在低压状态下，然后通过泵在它们进入燃烧室之前进行增压。这是制造大推力火箭发动机的标准方法，几乎所有用于将火箭送入轨道的发动机都会使用某种形式的泵来对燃料和氧化剂进行增压。

![](/images/substack/construction-physics/c0b3bcc395ad0ddcbb75.jpg)

用于土星 5 号火箭的 F-1 发动机。燃料泵和氧化剂泵位于右上角。

现在我们又遇到了新问题：由于需要处理的流体流量巨大且需要施加极高的压力，这些泵在运转时需要消耗极大的功率。例如，土星 5 号上使用的 F-1 发动机的涡轮泵需要约 41 兆瓦的功率，略低于 S8G 核反应堆 [向俄亥俄级潜艇推进轴输出](https://world-nuclear.org/information-library/non-power-nuclear-applications/transport/nuclear-powered-ships) 的功率。提供这种功率的一种方法是使用电池——火箭实验室（Rocket Lab）的 [电子号火箭（Electron rocket）](https://en.wikipedia.org/wiki/Rocket_Lab_Electron) 就拥有一台配备电池驱动电泵的发动机——但更常见的策略（几乎所有大型助推火箭都采用）是将火箭自身的推进剂作为动力源，燃烧少量的燃料和氧化剂来驱动涡轮，进而带动泵运转。

这类系统的配置方式有几种不同的途径。最简单的方法是将少量燃料和氧化剂导入涡轮，然后将产生的废气排出。这被称为 [燃气发生器循环（gas generator cycle）](https://en.wikipedia.org/wiki/Gas-generator_cycle)，也是 F-1 发动机以及 SpaceX 的梅林发动机所采用的方案。

另一种选择是燃烧部分燃料和氧化剂来驱动泵，但随后将燃烧后的推进剂与未燃烧的燃料/氧化剂一起导入主燃烧室。这被称为“分级燃烧”（staged combustion），用于驱动泵的较小燃烧室被称为“预燃室”（preburner）。这是一种比燃气发生器循环更复杂的布局，但效率也更高，因为驱动涡轮泵的高温废气不会被白白排放掉。

对于大多数分级燃烧发动机，只有一部分推进剂会流经预燃室：其余部分则绕道直接进入燃烧室。但 SpaceX 的猛禽发动机采用了一种被称为“全流量”（full flow）的特殊分级燃烧类型。在全流量发动机中，设有两个预燃室，一个驱动燃料泵，另一个驱动氧泵。所有推进剂都会流经预燃室：在其中一个预燃室中，少量氧化剂在大量燃料存在下燃烧（使大部分燃料未燃烧）；而在另一个预燃室中，少量燃料在大量氧化剂存在下燃烧（使大部分氧化剂未燃烧）。随后，富燃尾气和富氧尾气都会进入主燃烧室，并在那里混合燃烧。

![](/images/substack/construction-physics/558bf6af07881bcd9f64.jpg)

全流量分级燃烧原理图，来源：[维基百科](https://en.wikipedia.org/wiki/Staged_combustion_cycle#Full-flow_staged_combustion_cycle)。

全流量分级燃烧发动机非常复杂，在猛禽发动机之前仅制造过两台，且均未在火箭上成功飞行过。苏联在 20 世纪 60 年代研制了一款 FFSC 发动机 [RD-270](https://en.wikipedia.org/wiki/RD-270)，但它从未飞行过；美国在 20 世纪 90 年代和 21 世纪初制造了名为 [集成动力头演示机（Integrated Powerhead Demonstrator）](https://en.wikipedia.org/wiki/Integrated_Powerhead_Demonstrator) 的 FFSC 发动机部件，但从未将其开发成完整的发动机。（当 SpaceX 于 2012 年开始研制猛禽发动机时，它 [获得了部分](https://www.bloomberg.com/news/articles/2025-10-24/as-trump-defunds-nasa-elon-musk-s-spacex-runs-on-borrowed-science) 用于集成动力头演示机的设备。）不过 FFSC 发动机具有若干优势，其中之一是（理论上的）可靠性：由于流经驱动泵的涡轮的工质质量流量很大，涡轮可以在较低温度和较低压力下运行，从而使它们（在理论上）更加可靠。如果你是一家大力押注可重复使用火箭的公司，更可靠的涡轮显然极具吸引力。

##### 猛禽发动机是如何演进的

可以理解的是，SpaceX 对其先进火箭技术的许多细节都守口如瓶，关于猛禽发动机具体运行细节的官方信息比大家预想的要少。没有人拆开过猛禽发动机展示其内部构造，现有的大部分信息都来自 [埃隆·马斯克的推文](https://x.com/elonmusk/status/1819597689283121225) 或他在 [Everyday Astronaut 采访](https://www.youtube.com/watch?v=E7MQb9Y4FAE) 中的言论。

然而，外界有大量的 SpaceX 狂热爱好者，其中许多人会 [痴迷地拍摄](https://forum.nasaspaceflight.com/index.php?topic=53555.msg2819489#msg2819489) 运出工厂的每一台猛禽发动机，这些人付出了大量精力来推测猛禽发动机的工作原理。对我而言，这些推测中最有用的成果是各种粉丝制作的原理图，展示了猛禽发动机被认为是如何运作的。这些原理图并非官方出品——它们是 SpaceX 爱好者拼凑各方信息制作而成的——因此必须持保留态度看待。但对于了解人们认为不同版本的猛禽发动机是如何工作的，它们仍是一个有用的切入点。

首先，让我们来看看猛禽 1 号版本的一些原理图。[下图](https://www.reddit.com/r/spacex/comments/cxkrtb/detailed_diagram_of_the_raptor_engine_er26_gimbal/) 是由 [俄罗斯推进系统工程师](https://www.linkedin.com/in/eliseimaslov/?locale=en) 叶利谢伊·马斯洛夫（Elisei Maslov）于 2019 年绘制的。

![](/images/substack/construction-physics/56ad193f3d8bd3415f97.jpg)

来源：Reddit 上的 Elisei Maslov。

另一张有用的猛禽 1 号原理图是下面这张，由 [NASASpaceFlight 论坛成员“hisdirt”](https://forum.nasaspaceflight.com/index.php?topic=47506.msg2026812#msg2026812) 于 2019 年 12 月绘制。这张图格外有用，因为它在真实的发动机 3D 模型（竟然是用 Revit 建模的）上标出了各个发动机组件。

![](/images/substack/construction-physics/d2d0c1e9025b42703d0e.png)

来源：NASASpaceFlight 上的“hisdirt”。

在这些原理图中，你可以看到全流量分级燃烧发动机的基本组件：氧泵、涡轮和预燃室位于发动机顶部，而燃料泵、涡轮和预燃室则是侧面的总成。你还可以看到燃料在流回预燃室之前是如何流经喷管外侧的——这可以对喷管进行冷却，使其不至于被火箭尾气的高温融化，这被称为 [再生冷却（regenerative cooling）](https://en.wikipedia.org/wiki/Regenerative_cooling_\(rocketry\)。

下一张原理图由 NASASpaceFlight 用户“Livingjw”和“HVM”于 2022 年 2 月制作，取自 [维基百科](https://en.wikipedia.org/wiki/SpaceX_Raptor#/media/File:Raptor_2_Full_Flow_Staged_Combustion_Cycle_Estimate.svg)，展示了猛禽 2 号版本。这张图不如马斯洛夫的原理图详细——它基本上只展示了氧气和甲烷的流动路径——但它显示了相同的基本布局：顶部是氧泵总成，侧面是燃料泵总成。

![](/images/substack/construction-physics/730c638f349dcaf969ee.png)

而这张由 Twitter 用户“[TheSpaceEngineer](https://x.com/mcrs987/status/1877855892793696589)”于 2025 年 1 月发布的原理图，展示了猛禽 3 号版本。

![](/images/substack/construction-physics/4a098ae46f851af15f54.png)

假设这些原理图没有严重误导，我们可以看到发动机的主要架构在第 1 版和第 3 版之间并没有改变。它仍然是一台全流量分级燃烧发动机，依然保持着基本的布局：氧泵、涡轮和预燃室总成位于顶部，燃料泵、涡轮和预燃室安装在侧面，利用燃料对喷管进行再生冷却。你还可以看到，第 1 版和第 3 版上的许多较小管路是相同的。两者都展示了用于吹除（清除系统内推进剂）的氮气管路，两者都展示了通往点火器的燃料和氧化剂管路，并且两者都有将气态推进剂输送回储罐以在其排空过程中保持压力的燃料和氧化剂管路（这被称为 [自生增压（autogenous pressurization）](https://en.wikipedia.org/wiki/Autogenous_pressurization)）。

那么究竟改变了什么？如果我们仔细观察第 1 版和第 3 版的原理图（再次牢记这些是非官方且带有推测性质的），我们可以发现一些差异。第 3 版显示较小的管路被捆绑在一个“通用脐带接口”（common umbilical）中，如果我们查看猛禽 3 号连接到火箭上的照片，就能看到这一点：

![](/images/substack/construction-physics/0b724ca7ec3d35041022.jpg)

猛禽 3 号，来源：[Starship SpaceX 维基](https://starship-spacex.fandom.com/wiki/Raptor_3)。通用脐带接口似乎位于燃料涡轮总成上方。

第 1 版原理图还显示最初使用氦气来启动燃料和氧涡轮，而在第 3 版中这些管路已被取消，改用氮气。（对我来说，这种演进是否准确并不是特别明显——第 1 版原理图的一些 Reddit 评论者称并未使用氦气——但有 [一些证据](https://everydayastronaut.com/starship-superheavy-flight-test-2/#:%7E:text=Near%20the%20bottom%20of%20the%20booster%20are%20four%20elongated%20triangular%20chines.%20Each%20of%20these%20contain%20Composite%20Overwrapped%20Pressure%20Vessels%20\(COPVs\) 表明确实如此。）根据这些原理图，第 1 版上用于控制某些阀门的氦气在第 3 版中也不复存在，第 3 版原理图完全没有显示氦气管路。

第 3 版原理图还指出取消了一个换热器，NASASpaceFlight 论坛上的 [多位网友](https://forum.nasaspaceflight.com/index.php?topic=53555.msg2814429#msg2814429) 也呼应了这一点——这似乎是预燃室附近的一个气态氧换热器。此外，第 1 版中存在一条通向预燃室的燃料管路，但在第 3 版原理图中已不见踪影。

![](/images/substack/construction-physics/24a9845209f519e4ff29.png)

第 1 版

![](/images/substack/construction-physics/0ceb8f8069409641e095.jpg)

第 3 版

当然，更可靠的改进来源是埃隆·马斯克和 SpaceX 的声明。2022 年 NASASpaceFlight 一篇关于 SpaceX 星舰进展更新的文章 [指出](https://www.nasaspaceflight.com/2022/02/starships-self-sustaining-city-mars/)，“从涡轮机械到推力室喷管再到电子器件的所有部分”在猛禽 2 号上都经过了重新设计，涡轮泵体积缩小，预燃室控制器“已被移入控制箱中，而不是散布在发动机各处”。一篇关于同一次更新的 [Everyday Astronaut 文章](https://everydayastronaut.com/spacex-raptor-engine-comparison/) 也提到，“许多阀门被整合到了阀板中”。在最近针对 Reddit 前首席执行官黄易山（Yishan Wong）于 9 月 5 日发布的推文的回应中，马斯克列出了猛禽发动机随着时间推移的 [一份简要改动清单](https://x.com/elonmusk/status/2096292014824247360)：

![](/images/substack/construction-physics/ef3609d4d8fe994018bd.jpg)

这里的一大类是传感器以及它们所需的各种电线和电缆。据我所知，猛禽第 1 版在很大程度上是一台研制阶段的发动机，因此需要大量额外的传感器来监控发动机各部分的 [温度和压力](https://www.youtube.com/watch?v=ALiNmzoo1_E) 等指标，以确定其运行状态。随着发动机日趋成熟，许多此类传感器都可以被剔除（尽管其中一些可能被 [移到了内部](https://spaceflightnow.com/2026/05/12/spacex-targets-may-19-for-debut-of-starship-super-heavy-version-3-launch-pad-2/)）。

马斯克特别指出的另一项改动是主燃烧室火花点火器。顾名思义，点火器用于点燃主燃烧室中的燃料和氧化剂。这些点火器存在于猛禽第 1 版中，但在第 2 版中已被取消。马斯克没有透露用什么替代了它们，但这种改变可能与来自预燃室的高温燃料和氧化剂尾气流极易燃烧这一事实有关。（2019 年 NASASpaceFlight 上的一条评论就曾 [怀疑](https://forum.nasaspaceflight.com/index.php?topic=41363.msg1835123#msg1835123)，考虑到预燃室尾气流的高温，主燃烧室点火器是否还有必要存在。）

马斯克还指出，许多螺栓法兰连接被焊接连接所取代，虽然牺牲了可维修性，但减轻了质量并减少了可能发生泄漏的接头。这一过程似乎仍在继续，因为早期的猛禽 3 号照片显示发动机主体上有一个巨大的螺栓法兰，而在后来的照片中该法兰已被移除：

![](/images/substack/construction-physics/c723c878ee34d7785c1f.jpg)

来源：[Twitter 上的 Conor Martin](https://x.com/cmartin380/status/1959112874208763956/photo/1)。

猛禽 3 号上的另一个重大变化是，许多管路并未被取消，而是通过对许多组件进行 3D 打印移到了内部（马斯克此前曾表示，SpaceX“拥有世界上最先进的 3D 金属打印技术”[has the most advanced 3D metal printing technology in the world](https://x.com/elonmusk/status/1819795653972865460)，并且该公司在 2024 年获得了 [Velo3D](https://3dprintingindustry.com/news/spacex-signs-3d-printing-deal-with-velo3d-232685/) 的 3D 金属打印技术许可）。

![](/images/substack/construction-physics/80455c3c534901189ed4.png)

事实上，猛禽 3 号的特写照片似乎显示出了 3D 打印的纹路：

![](/images/substack/construction-physics/f36344bf1e64f3889cb1.jpg)

摄影：Ying Zhang，来源：[NASASpaceFlight](https://forum.nasaspaceflight.com/index.php?topic=53555.msg2782191#msg2782191) 上的 catdlr。

这种内部化的目的是为了移除更多部件，特别是隔热罩和灭火系统。猛禽第 1 版和第 2 版上大量的线缆和管道需要一个庞大且沉重的隔热罩来保护它们免受火箭尾气高温的侵蚀。将各种推进剂管路内部化并加入内部冷却系统，使得取消这一隔热罩和防火保护系统成为可能。事实上，猛禽从第 1 版到第 3 版最大的质量变化，正是来自于对“箭体端”发动机硬件的大量移除，而这几乎可以肯定主要是隔热罩。

![](/images/substack/construction-physics/358ee2bb2f288e5cce69.jpg)

带有隔热罩的猛禽发动机。

![](/images/substack/construction-physics/f4a9cb15c0c74e67fbc4.jpg)

来源：[Twitter 上的埃隆·马斯克](https://x.com/elonmusk/status/1819597689283121225)。

##### 结论

SpaceX 的猛禽发动机经历令人瞩目的演进，在短时间内完成了多个主要版本的迭代、性能的大幅提升，以及质量与外部组件的急剧缩减。发动机的基础架构并未改变——它仍然是一台全流量分级燃烧发动机，使用相同的核心组件——但支持其运行的各种辅助元件和部件已经发生了显著改变。

值得注意的是，尽管这种精简使得猛禽发动机在消除了各种独立零件的层面上变得更简单，但正如马斯克所指出的那样，使其正常工作依然是一项极其复杂的任务，猛禽 3 号内部增加的大量复杂性是这些图片所无法体现的。而且问题也并未彻底解决：在今年 7 月星舰 [第 13 次试飞（flight test 13）](https://en.wikipedia.org/wiki/Starship_flight_test_13) 的首次发射尝试中，由于数台猛禽 3 号发动机未能成功启动，飞船的飞行软件在 T-0 时刻（起飞前夕）自动 [中止了发射](https://www.reddit.com/r/SpaceXLounge/comments/1uzyxje/do_you_think_the_raptor_3_is_reliable/)。因此，猛禽发动机各版本的对比图，只是一项仍在持续演进的技术的阶段性快照。
