import http from 'node:http';
import path from 'node:path';
import { createApp } from './app.mjs';
import { storyHtml } from './seo.mjs';

export { createApp };
export async function start() {
  const app = createApp();
  const server = http.createServer(app);
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      configFile: path.resolve('vite.config.js'),
      server: { middlewareMode: true, hmr: { server } },
      appType: 'spa',
    });
    app.get('/story/:slug', storyHtml(vite));
    app.use(vite.middlewares);
  }
  const port = Number(process.env.PORT || 5433);
  await new Promise((ok) => server.listen(port, '0.0.0.0', ok));
  console.log(`The Meridian is live on port ${port}`);
  return server;
}
