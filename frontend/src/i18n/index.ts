import ar from "./messages/ar.json";
import en from "./messages/en.json";
import { directionFor, isLocale, type Locale } from "./locale";

export type { Locale, Direction } from "./locale";
export { directionFor, isLocale };

const dictionaries = { en, ar } as const;
export type MessageKey = keyof typeof en;

export function t(locale: Locale, key: MessageKey): string {
  return dictionaries[locale][key];
}
