import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from './db.mjs';
import { ranks, canRead, entitlement, failure } from './core.mjs';
import { liveWindow } from './publications.mjs';
import { scope } from './workflow.mjs';
import { imagePath } from './document.mjs';
import { hasUpload, streamUpload, useBlobUploads } from './upload-store.mjs';

// Permission is based on use in a released snapshot, not on knowing a file's URL.
// Covers are teasers; inline uploads follow the reader tier of their released story.
export async function visibleUploads(paths, user) {
  if (!paths.length) return new Set();
  const staff = user && user.roleId !== 'READER';
  const level = await entitlement(user?.id);
  const tiers = Object.keys(ranks).filter((tier) => canRead(tier, level));
  const metadata = { image: true, inlineUploads: true };
  const [live, working, owned] = await Promise.all([
    db.publication.findMany({
      where: {
        ...liveWindow(),
        OR: [
          { image: { in: paths } },
          { access: { in: tiers }, inlineUploads: { hasSome: paths } },
        ],
      },
      select: { ...metadata, access: true },
    }),
    staff
      ? db.article.findMany({
          where: {
            AND: [
              scope(user),
              { OR: [{ image: { in: paths } }, { inlineUploads: { hasSome: paths } }] },
            ],
          },
          select: metadata,
        })
      : [],
    staff
      ? db.uploadedImage.findMany({
          where: { uploaderId: user.id, path: { in: paths } },
          select: { path: true },
        })
      : [],
  ]);
  return new Set([
    ...live.flatMap((a) => [a.image, ...(canRead(a.access, level) ? a.inlineUploads : [])]),
    ...working.flatMap((a) => [a.image, ...a.inlineUploads]),
    ...owned.map((m) => m.path),
  ]);
}
function documentImages(node) {
  return node?.type === 'image' ? [node.attrs.src] : (node?.content || []).flatMap(documentImages);
}
export async function validateImages(cover, doc, user, staticImages) {
  const inline = documentImages(doc);
  const all = [...new Set([cover, ...inline])];
  const uploads = all.filter((p) => p.startsWith('/uploads/'));
  const allowed = await visibleUploads(uploads, user);
  if (uploads.some((p) => !allowed.has(p)))
    throw failure(400, 'Choose an image available to your desk or upload your own.');
  await Promise.all(
    all.map(async (p) => {
      if (!imagePath.test(p)) throw failure(400, 'Choose a local newspaper image.');
      const missing = () => failure(400, 'An image is unavailable. Replace it before saving.');
      if (p.startsWith('/uploads/')) {
        if (!(await hasUpload(path.basename(p)))) throw missing();
      } else if (staticImages) {
        if (!staticImages.has(p)) throw missing();
      } else {
        const dir =
          process.env.NODE_ENV === 'production' ? 'client/dist/images' : 'client/public/images';
        await fs.access(path.join(dir, path.basename(p))).catch(() => {
          throw missing();
        });
      }
    }),
  );
  return [...new Set(inline.filter((p) => p.startsWith('/uploads/')))];
}
export async function serveUpload(req, res) {
  const key = '/uploads/' + req.params.file;
  res.set('Cache-Control', 'private, no-store').vary('Cookie');
  if (!imagePath.test(key) || !(await visibleUploads([key], req.user)).has(key))
    return res.status(404).end();
  if (useBlobUploads) return streamUpload(req, res);
  res.sendFile(req.params.file, {
    root: path.resolve('data/uploads'),
    dotfiles: 'deny',
    cacheControl: false,
    lastModified: false,
  });
}
