export function visibleMarkupText(value: string): string {
  if (!value.includes("<") || !/<(?:w:|a:|p:)/.test(value)) return value;
  const decode = (text: string) => text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&apos;/g, "'");
  const parts = [...value.matchAll(/<(?:w:t|a:t|w:delText)(?:\s[^>]*)?>([\s\S]*?)<\/(?:w:t|a:t|w:delText)>/g)].map((match) => decode(match[1]));
  return decode(parts.length ? parts.join("") : value.replace(/<[^>]+>/g, ""));
}