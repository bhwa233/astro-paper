import { ENGLISH_LOCALE } from "@/i18n/locales";
import { buildLocalizedRss } from "@/utils/rssFeed";

export async function GET() {
  return buildLocalizedRss(ENGLISH_LOCALE);
}
