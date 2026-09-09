// JSON-LD 构造。站点原本只有文章页的 BlogPosting，缺三块搜索引擎真正会用的：
// 首页的 WebSite + SearchAction（结果页里的站内搜索框）、每页的 BreadcrumbList、
// 以及日报正文本质上的 ItemList。三处都要拼绝对地址，放一起免得各写一遍。

type JsonLd = Record<string, unknown>;

export type SchemaLink = { name: string; url: string };

export function buildWebSiteSchema(options: {
  name: string;
  description: string;
  url: string;
  searchUrl: string;
}): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: options.name,
    description: options.description,
    url: options.url,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        // 花括号里的名字是固定写法，Google 用它回填用户输入。
        urlTemplate: `${options.searchUrl}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function buildBreadcrumbSchema(items: SchemaLink[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** 日报正文的条目清单。每项指向正文里的小标题锚点，和站内搜索的子结果同一套 id。 */
export function buildItemListSchema(items: SchemaLink[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      url: item.url,
    })),
  };
}
