import type { SatteriProcessorOptions } from "@astrojs/markdown-satteri";

type HastPlugin = NonNullable<SatteriProcessorOptions["hastPlugins"]>[number];

const EXTERNAL_URL = /^(?:https?:|\/\/)/;

export default function externalLinks(): HastPlugin {
  return {
    name: "external-links",
    element: {
      filter: ["a"],
      visit(node, ctx) {
        const href = node.properties.href;

        if (typeof href !== "string" || !EXTERNAL_URL.test(href)) return;

        ctx.setProperty(node, "target", "_blank");
        ctx.setProperty(node, "rel", ["noopener", "noreferrer"]);
      },
    },
  };
}
