export interface UIStrings {
  nav: {
    home: string;
    posts: string;
    tags: string;
    about: string;
    archives: string;
    search: string;
  };
  post: {
    publishedAt: string;
    sharePostIntro: string;
    sharePostOn: string;
    sharePostViaEmail: string;
    tagLabel: string;
    backToTop: string;
    goBack: string;
    editPage: string;
    previousPost: string;
    nextPost: string;
    tableOfContents: string;
    readingTime: string;
    /** 图标旁的短版说法；完整版 readingTime 留给 title 与读屏。 */
    readingTimeShort: string;
    wordCount: string;
  };
  pagination: {
    prev: string;
    next: string;
    page: string;
    pageNumber: string;
    navigation: string;
  };
  language: {
    zhCn: string;
    en: string;
  };
  social: {
    emailToSite: string;
    siteOnPlatform: string;
  };
  code: {
    copy: string;
    copied: string;
  };
  lightbox: {
    zoomImage: string;
    zoomImageWithAlt: string;
    imagePreview: string;
    imagePreviewWithAlt: string;
    closeImagePreview: string;
  };
  home: {
    featured: string;
    recentPosts: string;
    allPosts: string;
    heroTitle: string;
    intro: string;
  };
  footer: {
    copyright: string;
    allRightsReserved: string;
  };
  pages: {
    tagTitle: string;
    tagDesc: string;
    tagTitleWithName: string;
    tagDescWithName: string;

    tagsTitle: string;
    tagsDesc: string;
    tagsCategoryHeading: string;
    tagsColumnHeading: string;

    postsTitle: string;
    postsDesc: string;

    archivesTitle: string;
    archivesDesc: string;

    searchTitle: string;
    searchDesc: string;
  };
  a11y: {
    skipToContent: string;
    rssFeed: string;
    openMenu: string;
    closeMenu: string;
    closeTableOfContents: string;
    toggleTheme: string;
    lightTheme: string;
    darkTheme: string;
    languageSwitcher: string;
    headingLink: string;
    searchPlaceholder: string;
    noResults: string;
    goToPreviousPage: string;
    goToNextPage: string;
  };
  notFound: {
    title: string;
    message: string;
    goHome: string;
  };
  search: {
    devModeWarningTitle: string;
    devModeWarningText: string;
    buildCommandLabel: string;
    pagefind: {
      language: string;
      placeholder: string;
      clear_search: string;
      load_more: string;
      search_label: string;
      filters_label: string;
      zero_results: string;
      many_results: string;
      one_result: string;
      alt_search: string;
      search_suggestion: string;
      searching: string;
      total_results: string;
      total_result: string;
      total_zero_results: string;
      loading: string;
    };
  };
}
