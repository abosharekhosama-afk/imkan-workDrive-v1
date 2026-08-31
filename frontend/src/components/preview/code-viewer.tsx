"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "../locale-provider";
import { getLanguageFromMime } from "../../lib/api/preview";

interface CodeViewerProps {
  url: string;
  mimeType: string;
  fileName: string;
}

type Token = { text: string; kind: "plain" | "comment" | "string" | "number" | "keyword" };

/** Soft cap so multi-megabyte text files don't freeze the main thread. */
const MAX_LINES = 5_000;

const LANGUAGE_PATTERNS: Record<string, { keywords: Set<string>; lineComment?: string[]; blockComment?: [string, string] }> = {
  clike: {
    keywords: new Set(["const","let","var","function","return","if","else","for","while","class","extends","import","export","from","default","new","await","async","try","catch","finally","throw","typeof","instanceof","switch","case","break","continue","this","super","public","private","protected","static","void","int","float","double","string","bool","struct","enum","fn","val","null","undefined","true","false"]),
    lineComment: ["//"],
    blockComment: ["/*", "*/"],
  },
  hash: {
    keywords: new Set(["def","return","if","elif","else","for","while","class","import","from","as","with","try","except","finally","raise","lambda","yield","pass","break","continue","and","or","not","in","is","echo","set","function","local","export","None","True","False","self"]),
    lineComment: ["#"],
  },
  markup: {
    keywords: new Set<string>(),
    blockComment: ["<!--", "-->"],
  },
  generic: {
    keywords: new Set(["if","else","for","while","return","function","class","import","export","switch","case","break","continue","end","then","do","true","false","null"]),
    lineComment: ["//", "#", "--"],
    blockComment: ["/*", "*/"],
  },
};

function languagePatterns(language: string) {
  if (language === "html" || language === "xml") return LANGUAGE_PATTERNS.markup!;
  if (language === "python" || language === "bash" || language === "yaml" || language === "ruby") return LANGUAGE_PATTERNS.hash!;
  if (language === "plaintext" || language === "csv") return LANGUAGE_PATTERNS.generic!;
  return LANGUAGE_PATTERNS.clike!;
}

/**
 * Tokenizes one line with a single left-to-right scan: strings, comments,
 * numbers and keywords. Deliberately dependency-free and line-scoped so the
 * highlight pass stays O(n) over large files.
 */
function tokenizeLine(line: string, language: string): Token[] {
  const { keywords, lineComment, blockComment } = languagePatterns(language);
  const tokens: Token[] = [];
  let cursor = 0;
  const push = (text: string, kind: Token["kind"]) => {
    if (text) tokens.push({ text, kind });
  };
  while (cursor < line.length) {
    const rest = line.slice(cursor);
    if (lineComment?.some((marker) => rest.startsWith(marker))) {
      push(rest, "comment");
      break;
    }
    if (blockComment && rest.startsWith(blockComment[0])) {
      const endIndex = rest.indexOf(blockComment[1], blockComment[0].length);
      if (endIndex >= 0) {
        push(rest.slice(0, endIndex + blockComment[1].length), "comment");
        cursor += endIndex + blockComment[1].length;
        continue;
      }
      push(rest, "comment");
      break;
    }
    const quote = rest[0];
    if (quote === "\"" || quote === "'" || quote === "`") {
      let end = 1;
      while (end < rest.length && (rest[end] !== quote || rest[end - 1] === "\\")) end += 1;
      push(rest.slice(0, Math.min(end + 1, rest.length)), "string");
      cursor += Math.min(end + 1, rest.length);
      continue;
    }
    const wordMatch = /^[\w$]+/.exec(rest);
    if (wordMatch) {
      const word = wordMatch[0];
      const kind = keywords.has(word) ? "keyword" : /^\d+$/.test(word) ? "number" : "plain";
      push(word, kind);
      cursor += word.length;
      continue;
    }
    push(rest[0], "plain");
    cursor += 1;
  }
  return tokens;
}

/**
 * Code/text viewer: line numbers, dependency-free syntax highlighting, copy
 * button and progressive rendering for large files (first MAX_LINES chunk,
 * "show more" grows the window).
 */
export function CodeViewer({ url, mimeType, fileName }: CodeViewerProps) {
  const { label } = useLocale();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleLines, setVisibleLines] = useState(MAX_LINES);
  const [copied, setCopied] = useState(false);

  const language = useMemo(() => getLanguageFromMime(mimeType, fileName), [mimeType, fileName]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setContent(null);
    setVisibleLines(MAX_LINES);
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => {
        setContent(text);
        setLoading(false);
      })
      .catch((fetchError) => {
        if ((fetchError as Error)?.name === "AbortError") return;
        setError(String((fetchError as Error)?.message ?? fetchError));
        setLoading(false);
      });
    return () => controller.abort();
  }, [url]);

  const lines = useMemo(() => (content ? content.split("\n") : []), [content]);
  const shown = useMemo(() => lines.slice(0, visibleLines), [lines, visibleLines]);

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(content ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Clipboard permission denied — nothing actionable in the viewer.
    }
  };

  return (
    <div className="zoho-viewer-root zoho-code-root">
      <div className="zoho-viewer-controls">
        <span className="zoho-ctl-zoom">{language} · {lines.length} {label("preview.lines")}</span>
        <span className="zoho-ctl-sep" />
        <button type="button" className="zoho-ctl" onClick={() => void copyAll()}>
          {copied ? label("preview.copied") : label("preview.copy")}
        </button>
      </div>
      <div className="zoho-code-scroll">
        {loading ? <div className="zoho-viewer-spinner" aria-label={label("preview.loading")} /> : null}
        {error ? (
          <div className="zoho-viewer-error">
            <p>{label("preview.error")}: {error}</p>
          </div>
        ) : null}
        {!loading && !error && content !== null ? (
          <div className="zoho-code-grid">
            <div className="zoho-code-gutter" aria-hidden>
              {shown.map((_, index) => (
                <span key={index}>{index + 1}</span>
              ))}
            </div>
            <pre className="zoho-code-body">
              {shown.map((line, index) => (
                <div key={index} className="zoho-code-line">
                  {tokenizeLine(line, language).map((token, tokenIndex) => (
                    <span key={tokenIndex} className={`tok-${token.kind}`}>{token.text}</span>
                  ))}
                </div>
              ))}
            </pre>
          </div>
        ) : null}
        {!loading && lines.length > visibleLines ? (
          <button type="button" className="zoho-btn zoho-code-more" onClick={() => setVisibleLines((count) => count + MAX_LINES)}>
            {`+${Math.min(MAX_LINES, lines.length - visibleLines)}`}
          </button>
        ) : null}
      </div>
    </div>
  );
}