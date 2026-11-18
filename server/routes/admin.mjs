import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'node:crypto';
import { writeUpload, deleteUpload, uploadLimitMb } from '../upload-store.mjs';
import { db } from '../db.mjs';
import { staff, allow, failure, slugify } from '../core.mjs';
import { cancelRenewal } from './payments.mjs';
import { editorial } from './editorial.mjs';
import { governance } from './governance.mjs';
export const adminRoutes = Router();
const r = adminRoutes;
r.use(staff);
const root = allow('SUPER_ADMIN');
r.use(editorial, governance);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: uploadLimitMb * 1024 * 1024, files: 1 },
});
r.post('/images', upload.single('image'), async (req, res) => {
  const b = req.file?.buffer;
  if (!b) throw failure(400, 'Select an image file.');
  const ext = b.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
    ? 'jpg'
    : b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      ? 'png'
      : b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'
        ? 'webp'
        : null;
  if (!ext) throw failure(400, `Use a JPEG, PNG or WebP image up to ${uploadLimitMb} MB.`);
  const file = crypto.randomUUID() + '.' + ext;
  await writeUpload(file, b);
  const image = '/uploads/' + file;
  try {
    await db.uploadedImage.create({ data: { path: image, uploaderId: req.user.id } });
  } catch (err) {
    await deleteUpload(file).catch(() => console.error('Could not remove unregistered upload'));
    throw err;
  }
  res.status(201).json({ image });
});
const category = z
  .object({
    name: z.string().trim().min(2).max(50),
    description: z.string().trim().min(10).max(240),
  })
  .strict();
const tag = z.object({ name: z.string().trim().min(2).max(45) }).strict();
// Editing section names and the shared tag index is global, not a desk-scoped article operation.
for (const [route, model, input] of [
  ['categories', 'category', category],
  ['tags', 'tag', tag],
]) {
  async function save(req, res, op) {
    const data = op === 'DELETE' ? {} : input.parse(req.body);
    if (model === 'category' && op !== 'DELETE') {
      data.slug = slugify(data.name);
      if (!data.slug) throw failure(400, 'Use a section name with a readable URL.');
    }
    const record = await db.$transaction(async (tx) => {
      if (
        op === 'DELETE' &&
        model === 'category' &&
        ((await tx.article.count({ where: { categoryId: req.params.id } })) ||
          (await tx.publication.count({ where: { categoryId: req.params.id } })))
      )
        throw failure(409, 'A current or retained editorial record still uses this section.');
      const row =
        op === 'CREATE'
          ? await tx[model].create({
              data: {
                ...data,
                ...(model === 'category' ? { position: await tx.category.count() } : {}),
              },
            })
          : op === 'UPDATE'
            ? await tx[model].update({ where: { id: req.params.id }, data })
            : await tx[model].delete({ where: { id: req.params.id } });
      await tx.adminEvent.create({
        data: {
          actorId: req.user.id,
          entity: model,
          entityId: row.id,
          action:
            model.toUpperCase() +
            '_' +
            { CREATE: 'CREATED', UPDATE: 'UPDATED', DELETE: 'DELETED' }[op],
          details: { name: row.name },
        },
      });
      return row;
    });
    res.status(op === 'CREATE' ? 201 : 200).json(op === 'DELETE' ? { ok: true } : record);
  }
  r.post('/' + route, root, (req, res) => save(req, res, 'CREATE'));
  r.patch('/' + route + '/:id', root, (req, res) => save(req, res, 'UPDATE'));
  r.delete('/' + route + '/:id', root, (req, res) => save(req, res, 'DELETE'));
}
r.get('/subscriptions', root, async (req, res) =>
  res.json(
    await db.subscription.findMany({
      include: { user: { select: { name: true, email: true } }, plan: true, payments: true },
      orderBy: { createdAt: 'desc' },
      take: 250,
    }),
  ),
);
r.post('/subscriptions/:id/cancel', root, async (req, res) =>
  res.json(await cancelRenewal(req.params.id)),
);
