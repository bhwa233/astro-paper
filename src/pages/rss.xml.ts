import { DEFAULT_LOCALE } from "@/i18n/locales";
import { buildLocalizedRss } from "@/utils/rssFeed";

export async function GET() {
  return buildLocalizedRss(DEFAULT_LOCALE);
}
