import '../styles/document.css';
import React from 'react';
export function legacyDocument(text = '') {
  return {
    type: 'doc',
    content: text.trim()
      ? text.split(/\n\s*\n/).map((s) => ({
          type: s.startsWith('## ') ? 'heading' : 'paragraph',
          ...(s.startsWith('## ') ? { attrs: { level: 2 } } : {}),
          content: [{ type: 'text', text: s.replace(/^## /, '') }],
        }))
      : [{ type: 'paragraph' }],
  };
}
export function documentText(n) {
  if (!n) return '';
  if (n.type === 'text') return n.text;
  if (n.type === 'hardBreak') return '\n';
  return (n.content || [])
    .map(documentText)
    .join(['heading', 'paragraph'].includes(n.type) ? '' : '\n');
}
function Node({ node: n }) {
  if (n.type === 'text') {
    let text = n.text;
    for (const m of n.marks || []) {
      const Tag = { bold: 'strong', italic: 'em', underline: 'u', strike: 's' }[m.type];
      if (Tag) text = <Tag>{text}</Tag>;
      else if (m.type === 'link' && /^https?:\/\//i.test(m.attrs?.href))
        text = (
          <a href={m.attrs.href} target="_blank" rel="noopener noreferrer">
            {text}
          </a>
        );
    }
    return text;
  }
  if (n.type === 'hardBreak') return <br />;
  if (n.type === 'image')
    return /^\/(uploads|images)\/[\w.-]+\.(png|webp|jpe?g)$/i.test(n.attrs?.src) ? (
      <figure>
        <img src={n.attrs.src} alt={n.attrs.alt || ''} loading="lazy" />
      </figure>
    ) : null;
  const Tag = {
    doc: React.Fragment,
    paragraph: 'p',
    heading: n.attrs?.level === 3 ? 'h3' : 'h2',
    bulletList: 'ul',
    orderedList: 'ol',
    listItem: 'li',
    blockquote: 'blockquote',
  }[n.type];
  if (!Tag) return null;
  return (
    <Tag {...(n.type === 'orderedList' ? { start: n.attrs?.start || 1 } : {})}>
      {(n.content || []).map((c, i) => (
        <Node key={i} node={c} />
      ))}
    </Tag>
  );
}
export function DocumentBody({ doc, text, className = '' }) {
  return (
    <div className={'article-prose rich-prose ' + className}>
      <Node node={doc || legacyDocument(text)} />
    </div>
  );
}
