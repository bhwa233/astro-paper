---
author: bhwa233
pubDatetime: 2026-06-19T00:10:00Z
modDatetime: 2026-06-19T00:10:00Z
title: 这个博客的内容结构和语言策略
featured: false
draft: false
tags:
  - configuration
  - i18n
description: 这篇文章说明当前只启用中文的内容组织方式，以及后续如何继续扩展。
---

这个博客当前只启用中文。语言由统一配置管理，中文是默认语言，后续可以在不改变现有中文路径的基础上增加其他语言。

## 路由约定

- 中文页面直接使用根路径，例如 `/posts/...`
- 未来启用其他语言后，再为对应语言增加独立的语言前缀和内容

非默认语言的页面共用 `src/pages/[locale]/` 下的路由模板。启用一种新语言时，只需要在配置中注册它，并补充对应的 UI 翻译和内容目录。

这样做的好处是，中文访问路径更短，也更符合这个站点当前的主要受众。

## 内容组织方式

文章按语言分别存放：

```text
src/content/posts/zh-cn/...
src/content/posts/<locale>/...
```

页面内容也是同样的思路：

```text
src/content/pages/zh-cn/about.md
src/content/pages/<locale>/about.md
```

## 这样做带来的结果

- 各语言文章可以独立维护
- 标签和分页不会把不同语言混在一起
- RSS 可以分别输出不同语言的内容

后面如果需要增加更多语言，也可以继续沿用这个结构。
