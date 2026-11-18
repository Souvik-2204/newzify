import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BlobNotFoundError, del, get, head, put } from '@vercel/blob';
import { failure } from './core.mjs';

export const useBlobUploads =
  process.env.VERCEL === '1' || process.env.UPLOAD_STORAGE === 'vercel-blob';
// Leave room for multipart framing under Vercel's 4.5 MB function request limit.
export const uploadLimitMb = useBlobUploads ? 4 : 5;
const localDir = path.resolve('data/uploads');
const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
function location(file) {
  if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(file)) throw failure(404, 'Image not found.');
  return `uploads/${file}`;
}
function blobOptions() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token)
    throw failure(
      503,
      'Private image storage is not configured. Contact the administrator.',
      'IMAGE_STORAGE_UNCONFIGURED',
    );
  return { token };
}
export async function writeUpload(file, bytes) {
  const pathname = location(file);
  if (useBlobUploads) {
    await put(pathname, bytes, {
      ...blobOptions(),
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: mime[file.split('.').pop()],
    });
  } else {
    await fs.mkdir(localDir, { recursive: true, mode: 0o700 });
    await fs.writeFile(path.join(localDir, file), bytes, { flag: 'wx', mode: 0o600 });
  }
}
export async function deleteUpload(file) {
  const pathname = location(file);
  if (useBlobUploads) await del(pathname, blobOptions());
  else await fs.unlink(path.join(localDir, file));
}
export async function hasUpload(file) {
  const pathname = location(file);
  try {
    if (useBlobUploads) await head(pathname, blobOptions());
    else await fs.access(path.join(localDir, file));
    return true;
  } catch (error) {
    if (error instanceof BlobNotFoundError || error.code === 'ENOENT') return false;
    throw error;
  }
}
// Called only after the newsroom or reader entitlement check. Do not redirect to Blob URLs.
export async function streamUpload(req, res) {
  const file = req.params.file;
  const pathname = location(file);
  const options = blobOptions();
  try {
    if (req.method === 'HEAD') {
      const metadata = await head(pathname, options);
      return res
        .set('Content-Type', mime[file.split('.').pop()])
        .set('Content-Length', String(metadata.size))
        .end();
    }
    const result = await get(pathname, { ...options, access: 'private' });
    if (!result?.stream) return res.status(404).end();
    res.set('Content-Type', mime[file.split('.').pop()]);
    await pipeline(Readable.fromWeb(result.stream), res);
  } catch (error) {
    if (error instanceof BlobNotFoundError && !res.headersSent) return res.status(404).end();
    if (res.destroyed) return;
    throw error;
  }
}
