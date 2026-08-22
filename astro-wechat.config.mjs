export default {
  contentDir: "src/content/posts",
  siteUrl: "https://blog.bhwa233.com/",
  permalinkPattern: "/posts/:slug/",
  defaultAuthor: "bhwa233",
  defaultCover: "/default-og.jpg",
  theme: "doocs-default",
  // 微信正文点不开外链：只留锚文本，不要文末那串参考链接。站点上的链接不受影响。
  // 需要 @lxw15337674/astro-wechat >= 0.1.10，旧版本会忽略这一项。
  outboundLinks: "text",
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
