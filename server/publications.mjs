import { Prisma } from '@prisma/client';
import { DAY } from './core.mjs';
export const liveWindow = () => ({
  region: 'IN',
  sourceDate: { gte: new Date(Date.now() - 28 * DAY), lte: new Date() },
  publishedAt: { lte: new Date() },
  article: { deletedAt: null },
});
export const publicCard = {
  id: true,
  revision: true,
  slug: true,
  title: true,
  summary: true,
  image: true,
  location: true,
  access: true,
  sourceDate: true,
  publishedAt: true,
  category: { select: { id: true, name: true, slug: true } },
  author: { select: { id: true, name: true } },
  article: {
    select: { featuredRank: true, editorPick: true, heroSlot: true, breaking: true, views: true },
  },
};
export const flatten = ({ article, ...snapshot }) => ({ ...snapshot, ...article });
export async function release(tx, a, at) {
  const keys = [
    'revision',
    'slug',
    'title',
    'summary',
    'content',
    'image',
    'imageCredit',
    'inlineUploads',
    'authorId',
    'categoryId',
    'access',
    'sourceName',
    'sourceUrl',
    'sourceDate',
    'region',
    'location',
    'seoTitle',
    'metaDescription',
  ];
  const values = Object.fromEntries(keys.map((k) => [k, a[k]]));
  const tags = a.tags.map((t) => ({ id: t.id }));
  Object.assign(values, { bodyDoc: a.bodyDoc || Prisma.DbNull, publishedAt: at });
  return tx.publication.upsert({
    where: { id: a.id },
    create: { id: a.id, ...values, tags: { connect: tags } },
    update: { ...values, tags: { set: tags } },
  });
}
