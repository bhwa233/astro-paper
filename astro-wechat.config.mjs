export default {
  contentDir: "src/content/posts",
  siteUrl: "https://blog.bhwa233.com/",
  permalinkPattern: "/posts/:slug/",
  defaultAuthor: "bhwa233",
  defaultCover: "/default-og.jpg",
  theme: "doocs-default",
  // 待办：外链在微信正文里点不开，现在一律转成编号 + 文末参考列表
  // （scripts/wechat/src/render/links.ts）。想改成只留锚文本得先给渲染器加开关，
  // 这里曾经写过一个 outboundLinks: "text"，但那个配置项从来没有实现过。
  eligibleTags: [
    "技术日报",
    "每周图书推荐",
    "Reddit人生讨论",
    "微博热搜",
    "随笔",
    "海外长文",
  ],
  remoteImageHosts: ["static01.nyt.com"],
  ledgerPath: ".astro-wechat/ledger.json",
};
