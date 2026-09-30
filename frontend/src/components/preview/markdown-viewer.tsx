"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useLocale } from "../locale-provider";
import { parseMarkdown, type MarkdownBlock, type MarkdownInline } from "../../lib/markdown-preview-logic";

function InlineText({ parts }: { parts: MarkdownInline[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === "strong") return <strong key={index}>{part.text}</strong>;
        if (part.kind === "em") return <em key={index}>{part.text}</em>;
        if (part.kind === "code") return <code key={index}>{part.text}</code>;
        if (part.kind === "link") return <a key={index} href={part.href} target="_blank" rel="noreferrer">{part.text}</a>;
        if (part.kind === "image") return <img key={index} src={part.href} alt={part.alt} />;
        return <span key={index}>{part.text}</span>;
      })}
    </>
  );
}

export function MarkdownDocument({ source }: { source: string }) {
  const blocks = parseMarkdown(source);
  return (
    <article className="zoho-md-page">
      {blocks.map((block, index) => <MarkdownBlockView key={index} block={block} />)}
    </article>
  );
}

function MarkdownBlockView({ block }: { block: MarkdownBlock }) {
  if (block.kind === "heading") {
    const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
    return <Tag><InlineText parts={block.inlines} /></Tag>;
  }
  if (block.kind === "paragraph") return <p><InlineText parts={block.inlines} /></p>;
  if (block.kind === "quote") return <blockquote><InlineText parts={block.inlines} /></blockquote>;
  if (block.kind === "code") return <pre><code>{block.text}</code></pre>;
  if (block.kind === "rule") return <hr />;
  if (block.kind === "list") {
    const List = block.ordered ? "ol" : "ul";
    return <List>{block.items.map((item, index) => <li key={index}><InlineText parts={item} /></li>)}</List>;
  }
  return (
    <table>
      <thead><tr>{block.header.map((cell, index) => <th key={index}><InlineText parts={cell} /></th>)}</tr></thead>
      <tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, index) => <td key={index}><InlineText parts={cell} /></td>)}</tr>)}</tbody>
    </table>
  );
}

export function MarkdownViewer({ url, fileName }: { url: string; fileName: string }) {
  const { locale, label } = useLocale();
  const ar = locale === "ar";
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setContent(null);
    fetch(url, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.text();
      })
      .then((text) => { setContent(text); setLoading(false); })
      .catch((cause) => {
        if ((cause as Error)?.name === "AbortError") return;
        setError(label("preview.error"));
        setLoading(false);
      });
    return () => controller.abort();
  }, [url, label]);

  let body: ReactNode = null;
  if (loading) body = <div className="zoho-viewer-spinner" aria-label={label("preview.loading")} />;
  else if (error) body = <div className="zoho-viewer-error"><p>{error}</p></div>;
  else if (source) body = <pre className="zoho-md-source">{content}</pre>;
  else body = <MarkdownDocument source={content ?? ""} />;

  return (
    <div className="zoho-viewer-root zoho-md-root">
      <div className="zoho-viewer-controls zoho-md-toolbar">
        <strong title={fileName}>{fileName}</strong>
        <span className="zoho-ctl-sep" />
        <button type="button" className={`zoho-ctl${source ? "" : " is-active"}`} onClick={() => setSource(false)}>{ar ? "المستند" : "Document"}</button>
        <button type="button" className={`zoho-ctl${source ? " is-active" : ""}`} onClick={() => setSource(true)}>{ar ? "المصدر" : "Source"}</button>
      </div>
      <div className="zoho-md-scroll">{body}</div>
    </div>
  );
}
