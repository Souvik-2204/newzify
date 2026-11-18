import { failure } from './core.mjs';
export const imagePath = /^\/(images|uploads)\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\.(jpg|jpeg|png|webp)$/i;
const block = ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'image'];
const children = {
  doc: block,
  paragraph: ['text', 'hardBreak'],
  heading: ['text', 'hardBreak'],
  blockquote: block,
  bulletList: ['listItem'],
  orderedList: ['listItem'],
  listItem: block,
};
export function safeLink(value) {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      u.href.length <= 2048
      ? u.href
      : null;
  } catch {
    return null;
  }
}
// Store a constrained document tree, never arbitrary HTML or client-supplied attributes.
export function normalizeDocument(value) {
  let nodes = 0,
    chars = 0,
    images = 0;
  const fail = (m) => {
    throw failure(400, m);
  };
  function visit(n, parent, depth) {
    if (!n || typeof n !== 'object' || Array.isArray(n) || depth > 16 || ++nodes > 4500)
      fail('The document exceeds the supported editing limits.');
    if (parent ? !children[parent]?.includes(n.type) : n.type !== 'doc')
      fail('Unsupported document structure.');
    let out = { type: n.type };
    if (n.type === 'text') {
      if (typeof n.text !== 'string' || !n.text.length) fail('Text must not be empty.');
      chars += n.text.length;
      if (chars > 100000) fail('The article exceeds 100,000 characters.');
      out.text = n.text;
      if (n.marks) {
        if (!Array.isArray(n.marks) || n.marks.length > 6) fail('Invalid text formatting.');
        out.marks = n.marks.map((m) => {
          if (!m || typeof m !== 'object') fail('Invalid text formatting.');
          if (['bold', 'italic', 'underline', 'strike'].includes(m.type)) return { type: m.type };
          if (m.type === 'link') {
            const href = safeLink(m.attrs?.href);
            if (!href) fail('Enter an http or https link.');
            return { type: 'link', attrs: { href } };
          }
          fail('Unsupported text formatting.');
        });
      }
      return out;
    }
    if (n.type === 'image') {
      if (++images > 40 || !imagePath.test(n.attrs?.src || ''))
        fail('Use an image uploaded to this newspaper.');
      const alt = String(n.attrs?.alt || '').trim();
      if (!alt || alt.length > 300) fail('Provide a short description for every inline image.');
      return { type: 'image', attrs: { src: n.attrs.src, alt } };
    }
    if (n.type === 'heading') {
      if (![2, 3].includes(n.attrs?.level)) fail('Use a section heading or subheading.');
      out.attrs = { level: n.attrs.level };
    }
    if (n.type === 'orderedList')
      out.attrs = {
        start: Math.max(1, Math.min(9999, Number.isInteger(n.attrs?.start) ? n.attrs.start : 1)),
      };
    if (n.content !== undefined) {
      if (!Array.isArray(n.content)) fail('Invalid content blocks.');
      out.content = n.content.map((c) => visit(c, n.type, depth + 1));
    }
    if (n.type === 'listItem' && out.content?.[0]?.type !== 'paragraph')
      fail('List items must begin with a paragraph.');
    return out;
  }
  return visit(value, null, 0);
}
export function plainText(n) {
  if (!n) return '';
  if (n.type === 'text') return n.text;
  if (n.type === 'hardBreak') return '\n';
  if (n.type === 'image') return '';
  return (n.content || [])
    .map(plainText)
    .join(['paragraph', 'heading'].includes(n.type) ? '' : '\n\n');
}
