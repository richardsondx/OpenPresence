import React, { Fragment, type ReactNode } from "react";

// A deliberately small, inert Markdown surface. No HTML or executable links.
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong>
      : part.startsWith("`") && part.endsWith("`") ? <code key={index}>{part.slice(1, -1)}</code>
        : <Fragment key={index}>{part}</Fragment>);
}

export function ChatRichText({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  const boundary = (line: string) => /^(?:#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s|```)/.test(line);
  while (index < lines.length) {
    const start = index;
    const line = lines[index];
    if (!line.trim()) { index++; continue; }
    if (line.startsWith("```")) {
      const code: string[] = [];
      index++;
      while (index < lines.length && !lines[index].startsWith("```")) code.push(lines[index++]);
      if (index < lines.length) index++;
      blocks.push(<pre key={start}><code>{code.join("\n")}</code></pre>);
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(<h3 key={start}>{inline(line.replace(/^#{1,6}\s+/, ""))}</h3>);
      index++;
    } else if (/^>/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push(<blockquote key={start}>{inline(quote.join("\n"))}</blockquote>);
    } else if (/^(?:[-*+]\s|\d+[.)]\s)/.test(line)) {
      const ordered = /^\d/.test(line);
      const pattern = ordered ? /^\d+[.)]\s+/ : /^[-*+]\s+/;
      const items: ReactNode[] = [];
      while (index < lines.length && pattern.test(lines[index])) {
        const item = [lines[index++].replace(pattern, "")];
        while (index < lines.length && /^\s+\S/.test(lines[index])) item.push(lines[index++].trimStart());
        items.push(<li key={index}>{inline(item.join("\n"))}</li>);
      }
      blocks.push(ordered ? <ol key={start} start={Number.parseInt(line, 10)}>{items}</ol> : <ul key={start}>{items}</ul>);
    } else {
      const paragraph = [lines[index++]];
      while (index < lines.length && lines[index].trim() && !boundary(lines[index])) paragraph.push(lines[index++]);
      blocks.push(<p key={start}>{inline(paragraph.join("\n"))}</p>);
    }
  }
  return <div className="chat-rich-text">{blocks}</div>;
}
