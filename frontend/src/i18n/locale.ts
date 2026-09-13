export type Locale = "en" | "ar";
export type Direction = "ltr" | "rtl";

export function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "ar";
}

export function directionFor(locale: Locale): Direction {
  return locale === "ar" ? "rtl" : "ltr";
}
