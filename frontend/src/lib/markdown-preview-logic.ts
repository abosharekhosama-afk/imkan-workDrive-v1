export type MarkdownInline =
  | { kind: "text"; text: string }
  | { kind: "strong"; text: string }
  | { kind: "em"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string }
  | { kind: "image"; alt: string; href: string };

export type MarkdownBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; inlines: MarkdownInline[] }
  | { kind: "paragraph"; inlines: MarkdownInline[] }
  | { kind: "code"; language: string; text: string }
  | { kind: "quote"; inlines: MarkdownInline[] }
  | { kind: "list"; ordered: boolean; items: MarkdownInline[][] }
  | { kind: "rule" }
  | { kind: "table"; header: MarkdownInline[][]; rows: MarkdownInline[][][] };

const SAFE_URL = /^(https?:|mailto:|\/|#)/i;

export function safeMarkdownUrl(href: string): string | null {
  const value = href.trim();
  return SAFE_URL.test(value) ? value : null;
}

function parseInline(source: string): MarkdownInline[] {
  const inlines: MarkdownInline[] = [];
  let cursor = 0;
  const pushText = (text: string) => {
    if (!text) return;
    const last = inlines[inlines.length - 1];
    if (last?.kind === "text") last.text += text;
    else inlines.push({ kind: "text", text });
  };
  while (cursor < source.length) {
    const rest = source.slice(cursor);
    const image = /^!\[([^\]]*)\]\(([^)\s]+)\)/.exec(rest);
    if (image) {
      const href = safeMarkdownUrl(image[2]);
      if (href) inlines.push({ kind: "image", alt: image[1], href });
      else pushText(image[1] || image[2]);
      cursor += image[0].length;
      continue;
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)/.exec(rest);
    if (link) {
      const href = safeMarkdownUrl(link[2]);
      if (href) inlines.push({ kind: "link", text: link[1], href });
      else pushText(link[1]);
      cursor += link[0].length;
      continue;
    }
    const code = /^`([^`]+)`/.exec(rest);
    if (code) {
      inlines.push({ kind: "code", text: code[1] });
      cursor += code[0].length;
      continue;
    }
    const strong = /^\*\*([^*]+)\*\*|^__([^_]+)__/.exec(rest);
    if (strong) {
      inlines.push({ kind: "strong", text: strong[1] || strong[2] });
      cursor += strong[0].length;
      continue;
    }
    const em = /^\*([^*\n]+)\*|^_([^_\n]+)_/.exec(rest);
    if (em && !/^_{2}/.test(rest)) {
      inlines.push({ kind: "em", text: em[1] || em[2] });
      cursor += em[0].length;
      continue;
    }
    const next = rest.slice(1).search(/[!`*\[]/);
    const take = next < 0 ? rest.length : next + 1;
    pushText(rest.slice(0, take));
    cursor += take;
  }
  return inlines;
}

function isRule(line: string): boolean {
  return /^(-{3,}|\*{3,}|_{3,})$/.test(line.trim());
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim());
}

/** Turn Markdown source into blocks a document preview can render. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const fence = /^```([\w-]*)\s*$/.exec(line.trim());
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test((lines[index] ?? "").trim())) {
        body.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ kind: "code", language: fence[1] || "", text: body.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3 | 4 | 5 | 6;
      blocks.push({ kind: "heading", level, inlines: parseInline(heading[2].trim()) });
      index += 1;
      continue;
    }
    if (isRule(line)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }
    if (line.trim().startsWith(">")) {
      const parts: string[] = [];
      while (index < lines.length && (lines[index] ?? "").trim().startsWith(">")) {
        parts.push((lines[index] ?? "").replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", inlines: parseInline(parts.join(" ")) });
      continue;
    }
    const unordered = /^\s*[-*+]\s+(.+)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      const items: MarkdownInline[][] = [];
      const marker = unordered ? /^\s*[-*+]\s+(.+)$/ : /^\s*\d+[.)]\s+(.+)$/;
      while (index < lines.length && marker.test(lines[index] ?? "")) {
        const match = marker.exec(lines[index] ?? "");
        items.push(parseInline(match?.[1] ?? ""));
        index += 1;
      }
      blocks.push({ kind: "list", ordered: Boolean(ordered), items });
      continue;
    }
    if (line.includes("|") && isTableSeparator(lines[index + 1] ?? "")) {
      const header = splitTableRow(line).map((cell) => parseInline(cell));
      index += 2;
      const rows: MarkdownInline[][][] = [];
      while (index < lines.length && (lines[index] ?? "").includes("|") && (lines[index] ?? "").trim()) {
        rows.push(splitTableRow(lines[index] ?? "").map((cell) => parseInline(cell)));
        index += 1;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }
    const paragraph: string[] = [line.trim()];
    index += 1;
    while (index < lines.length && (lines[index] ?? "").trim() && !/^(#{1,6}\s|```|>|\s*[-*+]\s|\s*\d+[.)]\s)/.test(lines[index] ?? "") && !isRule(lines[index] ?? "")) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    blocks.push({ kind: "paragraph", inlines: parseInline(paragraph.join(" ")) });
  }
  return blocks;
}
