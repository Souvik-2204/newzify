import { serveUpload } from './media.mjs';
import { uploadLimitMb } from './upload-store.mjs';
import { storyHtml } from './seo.mjs';
import express from 'express';
import path from 'node:path';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { ZodError } from 'zod';
import { rateLimit } from 'express-rate-limit';
import { identify } from './core.mjs';
import { publicRoutes } from './routes/public.mjs';
import { paymentRoutes, webhook } from './routes/payments.mjs';
import { adminRoutes } from './routes/admin.mjs';
export function createApp({ app = express(), web } = {}) {
  const production = Boolean(web) || process.env.NODE_ENV === 'production';
  app.locals.staticImages = web ? new Set(web.images) : null;
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: production
        ? {
            useDefaults: true,
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", 'https://*.razorpay.com'],
              connectSrc: ["'self'", 'https://*.razorpay.com', 'https://*.razorpay.in'],
              frameSrc: ['https://*.razorpay.com', 'https://*.razorpay.in'],
              frameAncestors: null,
              imgSrc: ["'self'", 'data:', 'blob:', 'https://*.razorpay.com'],
              styleSrc: ["'self'", "'unsafe-inline'"],
              objectSrc: ["'none'"],
            },
          }
        : false,
      frameguard: false,
      crossOriginEmbedderPolicy: false,
      strictTransportSecurity: process.env.NODE_ENV === 'production' ? undefined : false,
    }),
  );
  app.post(
    '/api/webhooks/razorpay',
    express.raw({ type: 'application/json', limit: '256kb' }),
    webhook,
  );
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Please wait a moment before trying again.' },
    }),
  );
  app.use(
    '/api',
    (req, res, next) => {
      res.set('Cache-Control', 'private, no-store');
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('x-meridian-request') !== '1')
        return res.status(403).json({ error: 'A same-origin application request is required.' });
      next();
    },
    express.json({ limit: '160kb' }),
    cookieParser(),
    identify,
    publicRoutes,
    paymentRoutes,
  );
  app.use('/api/admin', adminRoutes);
  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.get('/uploads/:file', cookieParser(), identify, serveUpload);
  app.use('/uploads', (req, res) => res.status(404).end());
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    let status = err.status || err.statusCode || 500,
      message = status < 500 ? err.message : 'Something went wrong. Please try again.';
    if (err instanceof ZodError) {
      status = 400;
      message = err.issues
        .map((x) => `${x.path.join('.')}: ${x.message}`)
        .slice(0, 2)
        .join(' · ');
    }
    if (err.code === 'P2002') {
      status = 409;
      message = 'That email, name or record is already in use.';
    }
    if (err.code === 'P2025') {
      status = 404;
      message = 'This record no longer exists.';
    }
    if (err.code === 'P2003') {
      status = 400;
      message = 'The selected category or related record is unavailable.';
    }
    if (err.code === 'LIMIT_FILE_SIZE') {
      status = 413;
      message = `Images must be ${uploadLimitMb} MB or smaller.`;
    }
    const publicCode = ['CHECKOUT_UNAVAILABLE', 'IMAGE_STORAGE_UNCONFIGURED'].includes(err.code);
    if (publicCode) message = err.message;
    if (status >= 500) console.error('Request failed:', req.method, req.path, err.code || err.name);
    res.status(status).json({ error: message, code: publicCode ? err.code : undefined });
  });
  if (web) {
    // The Express builder serves generated public/ assets from its CDN. Only HTML and
    // its image allowlist are needed in the function bundle.
    app.get('/story/:slug', storyHtml(null, web.html));
    app.get('/{*path}', (req, res) => res.type('html').send(web.html));
  } else if (production) {
    app.get('/story/:slug', storyHtml());
    app.use(express.static(path.resolve('client/dist')));
    app.get('/{*path}', (req, res) => res.sendFile(path.resolve('client/dist/index.html')));
  }
  return app;
}
