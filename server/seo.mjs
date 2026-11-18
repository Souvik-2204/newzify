import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from './db.mjs';
import { liveWindow } from './publications.mjs';
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
// Crawler-visible metadata derived exclusively from the released snapshot; never fetch the body.
export function storyHtml(vite = null, builtHtml = null) {
  return async (req, res, next) => {
    try {
      const a = await db.publication.findFirst({
        where: { ...liveWindow(), slug: req.params.slug },
        select: {
          slug: true,
          title: true,
          summary: true,
          seoTitle: true,
          metaDescription: true,
          image: true,
        },
      });
      let html =
        builtHtml ??
        (await fs.readFile(
          path.resolve(vite ? 'client/index.html' : 'client/dist/index.html'),
          'utf8',
        ));
      if (a) {
        const title = escape((a.seoTitle || a.title) + ' — The Meridian'),
          desc = escape(a.metaDescription || a.summary);
        html = html
          .replace(/<title>.*?<\/title>/s, () => `<title>${title}</title>`)
          .replace(
            /<meta\s+name="description"\s+content="[^"]*"\s*\/?\s*>/i,
            () => `<meta name="description" content="${desc}"/>`,
          )
          .replace(
            '</head>',
            () =>
              `<meta property="og:type" content="article"/><meta property="og:title" content="${title}"/><meta property="og:description" content="${desc}"/><link rel="canonical" href="${escape(process.env.PUBLIC_ORIGIN || '')}/story/${escape(a.slug)}"/></head>`,
          );
      } else html = html.replace('</head>', '<meta name="robots" content="noindex"/></head>');
      if (vite) html = await vite.transformIndexHtml(req.originalUrl, html);
      res
        .set('Cache-Control', 'private, no-store')
        .status(a ? 200 : 404)
        .type('html')
        .send(html);
    } catch (e) {
      next(e);
    }
  };
}
