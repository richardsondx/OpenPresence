import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatRichText } from "../app/chat-rich-text";

describe("private chat formatting", () => {
  it("separates a plan, draft quote, and steps without creating actions", () => {
    const html = renderToStaticMarkup(createElement(ChatRichText, { content: '## Draft plan\n\n1. Reply tomorrow\n2. Review responses\n\n> Draft wording\n\n**Nothing published.**' }));
    expect(html).toContain('<h3>Draft plan</h3>');
    expect(html).toContain('<ol start="1"><li>Reply tomorrow</li><li>Review responses</li></ol>');
    expect(html).toContain('<blockquote>Draft wording</blockquote>');
    expect(html).toContain('<strong>Nothing published.</strong>');
    expect(html).not.toContain('<button');
  });
  it("keeps unsafe markup inert and preserves ordinary paragraphs", () => {
    const html = renderToStaticMarkup(createElement(ChatRichText, { content: 'First paragraph\n\n<script>alert(1)</script>\n\n```html\n<img onerror=alert(1)>\n```' }));
    expect(html).toContain('<p>First paragraph</p>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
  });
  it("makes source citations clickable while preserving escaped labels and inert unsafe links", () => {
    const html = renderToStaticMarkup(createElement(ChatRichText, { content: '[Source <script>](https://example.org/research?q=a&b=c)\n\n[Unsafe](javascript:alert) [Credentials](https://user:secret@example.org/)\n\n`[Code](https://example.org/)`' }));
    expect(html).toContain('href="https://example.org/research?q=a&amp;b=c" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('Source &lt;script&gt;</a>');
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('<code>[Code](https://example.org/)</code>');
    expect(html).not.toContain('<script>');
  });
});
